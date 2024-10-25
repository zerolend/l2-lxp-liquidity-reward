import { write } from "fast-csv";
import fs from "fs";
import csv from "csv-parser";
import { BlockData, OutputDataSchemaRow } from "./sdk/types";
import { getUserTVLLegacyByBlock } from "./sdk/tvl";
import { getUserStakeByBlock } from "./sdk/stake";
import { getUserLPByBlock } from "./sdk/lp";
import { getUserTVLFoxyByBlock } from "./sdk/foxy";

const readBlocksFromCSV = async (filePath: string): Promise<BlockData[]> => {
  const blocks: BlockData[] = [];

  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv()) // Specify the separator as '\t' for TSV files
      .on("data", (row) => {
        const blockNumber = parseInt(row.number, 10);
        const blockTimestamp = parseInt(row.timestamp, 10);
        if (!isNaN(blockNumber) && blockTimestamp) {
          blocks.push({ blockNumber: blockNumber, blockTimestamp });
        }
      })
      .on("end", () => {
        resolve();
      })
      .on("error", (err) => {
        reject(err);
      });
  });

  return blocks;
};

readBlocksFromCSV("hourly_blocks.csv")
  .then(async (blocks: BlockData[]) => {
    console.log(blocks);
    let allCsvRows: OutputDataSchemaRow[] = []; // Array to accumulate CSV rows for all blocks

    for (const block of blocks) {
      try {
        const data = await getUserTVLByBlock(block);
        allCsvRows = allCsvRows.concat(data);
      } catch (error) {
        console.error(`An error occurred for block ${block}:`, error);
      }
    }
    await new Promise((resolve, reject) => {
      const ws = fs.createWriteStream(`outputData.csv`, { flags: "w" });
      write(allCsvRows, { headers: true })
        .pipe(ws)
        .on("finish", () => {
          console.log(`CSV file has been written.`);
          resolve;
        });
    });
  })
  .catch((err) => {
    console.error("Error reading CSV file:", err);
  });

const retryAsync = async (
  fn: () => Promise<any>,
  retries: number = 3
): Promise<any> => {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt >= retries) {
        console.error(`Function failed after ${retries} retries:`, error);
        throw error;
      }
      console.warn(`Attempt ${attempt} failed. Retrying...`);
    }
  }
};

const getUserTVLByBlock = async (block: BlockData): Promise<any> => {
  let allCsvRows: OutputDataSchemaRow[] = []; // Array to accumulate CSV rows for all blocks

  const resultTvlFoxy = await retryAsync(() => getUserTVLFoxyByBlock(block));
  allCsvRows = allCsvRows.concat(resultTvlFoxy);

  const resultStake = await retryAsync(() => getUserStakeByBlock(block));
  allCsvRows = allCsvRows.concat(resultStake);

  const resultLp = await retryAsync(() => getUserLPByBlock(block));
  allCsvRows = allCsvRows.concat(resultLp);

  const resultTvlLegacy = await retryAsync(() =>
    getUserTVLLegacyByBlock(block)
  );
  allCsvRows = allCsvRows.concat(resultTvlLegacy);

  return allCsvRows;
};

module.exports = {
  getUserTVLByBlock,
};
