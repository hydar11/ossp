/**
 * Fetch all active eggs for NFT holders — IMPROVED VERSION
 * - Includes iterations field
 * - Fetches both hatchery eggs AND pets (DESCRIPTION_CID === 'Pet')
 * - Generates 6 output files:
 *   Eggs:
 *     1. summary.json - Global statistics with proper grouping (eggs only)
 *     2. top-holders.json - Top 100 holders with egg breakdown (eggs only)
 *     3. eggs-by-id.json - Lookup table by NFT ID (eggs only)
 *   Pets:
 *     4. pet-summary.json - Pet stats (total, rarity map, faction map)
 *     5. top-holders-pets.json - Top pet holders
 *     6. pets-by-id.json - Pet lookup by NFT ID
 */

import https from "https";
import fs from "fs";

// === SETTINGS ===
const INPUT_FILE = "unique_holders.json";
const SUMMARY_JSON = "summary.json";
const TOP_HOLDERS_JSON = "top-holders.json";
const EGGS_BY_ID_JSON = "eggs-by-id.json";
const PET_SUMMARY_JSON = "pet-summary.json";
const PET_TOP_HOLDERS_JSON = "top-holders-pets.json";
const PETS_BY_ID_JSON = "pets-by-id.json";
const API_BASE = "https://gigaverse.io/api/pets/player?id=";

const CONCURRENCY = 20;
const DELAY_BETWEEN_BATCHES = 900;
const MAX_RETRIES = 20;
const TIMEOUT_MS = 900;

// === UTILS ===
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const { statusCode } = res;
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (statusCode < 200 || statusCode >= 300) {
          return reject(new Error(`HTTP ${statusCode}`));
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error("Invalid JSON"));
        }
      });
    });
    req.on("error", (err) => reject(err));
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error("Timeout")));
  });
}

async function fetchPlayer(address, attempt = 1) {
  const url = `${API_BASE}${address}`;
  try {
    const data = await fetchJson(url);
    if (!data?.entities) return { eggs: [], pets: [] };

    const eggs = [];
    const pets = [];

    for (const ent of data.entities) {
      const desc = (ent.DESCRIPTION_CID || ent.description || "").toLowerCase();
      const hs = ent.data?.hatcheryStatus;

      // Egg: is in hatchery
      if (hs?.isInHatchery === true) {
        const fateArr = Array.isArray(hs.fate?.probabilities)
          ? hs.fate.probabilities.map(Number)
          : [];
        eggs.push({
          owner: ent.OWNER_CID ?? "",
          docId: ent.docId ?? "",
          eggType: ent.data?.eggType ?? "",
          progress: hs.progress ?? "",
          rarity: hs.rarity ?? "",
          comfort: hs.comfort?.current ?? "",
          temperature: hs.temperature?.current ?? "",
          iterations: hs.fate?.interactionCount ?? 0,
          fateProbabilities: fateArr.join("|"),
          fateArray: fateArr,
          isReadyToHatch: hs.isReadyToHatch ?? "",
          updatedAt: ent.updatedAt ?? "",
        });
        continue;
      }

      // Pet: DESCRIPTION_CID === "pet" (case-insensitive)
      if (desc === "pet") {
        pets.push({
          owner: ent.OWNER_CID ?? "",
          docId: ent.docId ?? "",
          type: ent.TYPE_CID ?? "",
          eggType: ent.data?.eggType ?? "",
          gender: ent.data?.gender ?? ent.data?.Gender ?? "",
          rarity: ent.RARITY_CID ?? null,
          faction: ent.FACTION_CID ?? null,
          complete: ent.COMPLETE_CID ?? null,
          name: ent.NAME_CID ?? null,
          image: ent.IMG_URL_CID ?? ent.IMG_CID ?? ent.data?.IMG_URL_CID ?? ent.data?.image ?? "",
          updatedAt: ent.updatedAt ?? ""
        });
      }
    }

    return { eggs, pets };
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      console.warn(`⚠️ Retry ${attempt} for ${address} (${err.message})`);
      await sleep(1500 * attempt);
      return fetchPlayer(address, attempt + 1);
    } else {
      console.error(`❌ ${address} → ${err.message}`);
      return { eggs: [], pets: [] };
    }
  }
}

// === AGGREGATION FUNCTIONS ===

function groupProgress(eggs) {
  const groups = {};

  // Initialize buckets: 0, 1-3%, 3-6%, 6-9%, ..., 97-100%
  groups["0"] = 0; // First bucket is exactly 0
  for (let i = 1; i <= 97; i += 3) {
    const key = `${i}-${Math.min(i + 3, 100)}%`;
    groups[key] = 0;
  }

  for (const egg of eggs) {
    const prog = Number(egg.progress);
    if (!isNaN(prog) && prog >= 0 && prog <= 100) {
      if (prog === 0) {
        groups["0"]++;
      } else if (prog > 0 && prog <= 3) {
        groups["1-3%"]++;
      } else {
        // For 3.01 to 100: bucket into 3-6%, 6-9%, etc.
        const bucket = Math.floor((prog - 0.01) / 3) * 3 + 3;
        const key = `${bucket}-${Math.min(bucket + 3, 100)}%`;
        groups[key] = (groups[key] || 0) + 1;
      }
    }
  }

  return groups;
}

function groupQualityEfficiency(eggs) {
  const groups = {
    "0%": 0,
    "1-19%": 0,
    "20-39%": 0,
    "40-59%": 0,
    "60-79%": 0,
    "80-99%": 0,
    "100%": 0
  };

  for (const egg of eggs) {
    const quality = Number(egg.rarity);
    const progress = Number(egg.progress);

    // Skip if invalid data
    if (isNaN(quality) || isNaN(progress)) continue;

    // Handle 0% quality separately
    if (quality === 0) {
      groups["0%"]++;
      continue;
    }

    // Handle eggs with 0 progress but non-zero quality (shouldn't happen, but handle edge case)
    if (progress === 0) {
      groups["1-19%"]++;
      continue;
    }

    // Calculate efficiency: (quality / progress) * 100
    const efficiency = (quality / progress) * 100;

    // Group by efficiency
    if (efficiency === 100) {
      groups["100%"]++;
    } else if (efficiency >= 80 && efficiency < 100) {
      groups["80-99%"]++;
    } else if (efficiency >= 60 && efficiency < 80) {
      groups["60-79%"]++;
    } else if (efficiency >= 40 && efficiency < 60) {
      groups["40-59%"]++;
    } else if (efficiency >= 20 && efficiency < 40) {
      groups["20-39%"]++;
    } else {
      groups["1-19%"]++;
    }
  }

  return groups;
}

function generateSummary(eggs) {
  const summary = {
    lastUpdate: new Date().toISOString(),
    totalActiveEggs: eggs.length,
    eggsByType: {},
    eggsByComfort: {},
    eggsByTemperature: {},
    eggsByQualityEfficiency: groupQualityEfficiency(eggs),
    eggsByProgress: groupProgress(eggs),
    fateAverages: Array(9).fill(0),
  };

  const fateTotals = Array(9).fill(0);
  let fateCount = 0;

  for (const e of eggs) {
    // eggType
    const type = e.eggType || "Unknown";
    summary.eggsByType[type] = (summary.eggsByType[type] || 0) + 1;

    // comfort
    const comfort = Number(e.comfort);
    if (!isNaN(comfort)) {
      summary.eggsByComfort[comfort] = (summary.eggsByComfort[comfort] || 0) + 1;
    }

    // temperature
    const temp = Number(e.temperature);
    if (!isNaN(temp)) {
      summary.eggsByTemperature[temp] = (summary.eggsByTemperature[temp] || 0) + 1;
    }

    // fate averages
    if (Array.isArray(e.fateArray) && e.fateArray.length === 9) {
      e.fateArray.forEach((val, i) => (fateTotals[i] += val));
      fateCount++;
    }
  }

  if (fateCount > 0) {
    summary.fateAverages = fateTotals.map((x) =>
      Number((x / fateCount).toFixed(2))
    );
  }

  return summary;
}

function generateTopHolders(eggs) {
  const holders = {};

  for (const egg of eggs) {
    const addr = egg.owner.toLowerCase();
    if (!holders[addr]) {
      holders[addr] = {
        address: addr,
        totalEggs: 0,
        byType: {}
      };
    }

    holders[addr].totalEggs++;
    const type = egg.eggType || "Unknown";
    holders[addr].byType[type] = (holders[addr].byType[type] || 0) + 1;
  }

  // Convert to array and sort by total
  return Object.values(holders)
    .sort((a, b) => b.totalEggs - a.totalEggs)
    .slice(0, 100); // Top 100
}

function generateEggsById(eggs) {
  const lookup = {};

  for (const egg of eggs) {
    lookup[egg.docId] = {
      nftId: egg.docId,
      owner: egg.owner,
      eggType: egg.eggType,
      progress: Number(egg.progress),
      rarity: Number(egg.rarity),
      comfort: Number(egg.comfort),
      temperature: Number(egg.temperature),
      iterations: Number(egg.iterations),
      fate: egg.fateArray,
      updatedAt: egg.updatedAt
    };
  }

  return lookup;
}

// === PET AGGREGATION ===
function generatePetSummary(pets) {
  const rarityCounts = {};
  const factionCounts = {};
  const typeCounts = {};
  const genderCounts = { Male: 0, Female: 0, Unknown: 0 };

  for (const p of pets) {
    const rarity = p.rarity ?? "unknown";
    rarityCounts[rarity] = (rarityCounts[rarity] || 0) + 1;

    const faction = p.faction ?? "unknown";
    factionCounts[faction] = (factionCounts[faction] || 0) + 1;

    const type = p.eggType || p.type || "Unknown";
    typeCounts[type] = (typeCounts[type] || 0) + 1;

    const gRaw = p.gender;
    const g = typeof gRaw === "string" ? gRaw.trim().toLowerCase() : "";
    const norm = g === "male" ? "Male" : g === "female" ? "Female" : "Unknown";
    genderCounts[norm] = (genderCounts[norm] || 0) + 1;
  }

  return {
    lastUpdate: new Date().toISOString(),
    totalPets: pets.length,
    rarityCounts,
    factionCounts,
    typeCounts,
    genderCounts
  };
}

function generatePetsById(pets) {
  const lookup = {};
  for (const p of pets) {
    lookup[p.docId] = {
      docId: p.docId,
      owner: p.owner,
      type: p.type,
      eggType: p.eggType,
      gender: p.gender,
      rarity: p.rarity,
      faction: p.faction,
      complete: p.complete,
      name: p.name,
      updatedAt: p.updatedAt
    };
  }
  return lookup;
}

function generateTopHoldersPets(pets) {
  const holders = {};
  for (const p of pets) {
    const addr = p.owner.toLowerCase();
    if (!holders[addr]) {
      holders[addr] = { address: addr, totalPets: 0, byType: {} };
    }
    holders[addr].totalPets++;
    const t = p.eggType || p.type || "Unknown";
    holders[addr].byType[t] = (holders[addr].byType[t] || 0) + 1;
  }
  return Object.values(holders).sort((a, b) => b.totalPets - a.totalPets).slice(0, 100);
}

// === MAIN ===
async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Missing input file: ${INPUT_FILE}`);
    process.exit(1);
  }

  const addresses = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));
  console.log(`📦 Loaded ${addresses.length} addresses from ${INPUT_FILE}`);

  const eggResults = [];
  const petResults = [];

  for (let i = 0; i < addresses.length; i += CONCURRENCY) {
    const batch = addresses.slice(i, i + CONCURRENCY);
    console.log(
      `🔍 Fetching wallets ${i + 1} - ${Math.min(
        i + CONCURRENCY,
        addresses.length
      )}`
    );
    const batchResults = await Promise.all(batch.map((a) => fetchPlayer(a)));
    for (const r of batchResults) {
      if (Array.isArray(r?.eggs) && r.eggs.length) eggResults.push(...r.eggs);
      if (Array.isArray(r?.pets) && r.pets.length) petResults.push(...r.pets);
    }
    await sleep(DELAY_BETWEEN_BATCHES);
  }

  console.log(`✅ Fetched ${eggResults.length} active eggs`);
  console.log(`✅ Fetched ${petResults.length} pets`);

  // Generate all outputs
  const summary = generateSummary(eggResults);
  const topHolders = generateTopHolders(eggResults);
  const eggsById = generateEggsById(eggResults);

  const petSummary = generatePetSummary(petResults);
  const petTopHolders = generateTopHoldersPets(petResults);
  const petsById = generatePetsById(petResults);

  // Write files
  fs.writeFileSync(SUMMARY_JSON, JSON.stringify(summary, null, 2));
  fs.writeFileSync(TOP_HOLDERS_JSON, JSON.stringify(topHolders, null, 2));
  fs.writeFileSync(EGGS_BY_ID_JSON, JSON.stringify(eggsById, null, 2));
  fs.writeFileSync(PET_SUMMARY_JSON, JSON.stringify(petSummary, null, 2));
  fs.writeFileSync(PET_TOP_HOLDERS_JSON, JSON.stringify(petTopHolders, null, 2));
  fs.writeFileSync(PETS_BY_ID_JSON, JSON.stringify(petsById, null, 2));

  console.log(`💾 Summary -> ${SUMMARY_JSON}`);
  console.log(`💾 Top Holders -> ${TOP_HOLDERS_JSON}`);
  console.log(`💾 Eggs by ID -> ${EGGS_BY_ID_JSON}`);
  console.log(`💾 Pet Summary -> ${PET_SUMMARY_JSON}`);
  console.log(`💾 Pet Top Holders -> ${PET_TOP_HOLDERS_JSON}`);
  console.log(`💾 Pets by ID -> ${PETS_BY_ID_JSON}`);
  console.log(`🎉 Done!`);
}

main();
