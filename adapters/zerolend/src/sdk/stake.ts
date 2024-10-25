import axios from "axios";
import rateLimit from "axios-rate-limit";

import {
  BlockData,
  IOmniStakingData,
  IOmniStakingResponse,
  OutputDataSchemaRow,
} from "./types";

const axiosInstance = rateLimit(axios.create(), {
  maxRequests: 5,
  perMilliseconds: 1000,
});

const queryURL =
  "https://api.goldsky.com/api/public/project_clsk1wzatdsls01wchl2e4n0y/subgraphs/zerolend-omnistaking/1.0.2/gn";

const tokenAddress = "0x78354f8dccb269a615a7e0a24f9b0718fdc3c7a7"; //do we need to convert the case
const symbol = "ZERO";

export const getUserStakeByBlock = async (
  blocks: BlockData
): Promise<OutputDataSchemaRow[]> => {
  try {
    const timestamp = blocks.blockTimestamp;
    const first = 1000;
    const rows: OutputDataSchemaRow[] = [];

    let lastAddress = "0x0000000000000000000000000000000000000000";
    console.log("working on ZERO stakers data");
    let dataAvailable = true;

    do {
      const query = `{
      tokenBalances(
        where: {
          id_gt: "${lastAddress}",
          balance_omni_gt: "0"
        }
        first: ${first}
      ) {
        id
        balance_omni
      }
    }`;

      const response = await axiosInstance.post(
        queryURL,
        { query },
        {
          headers: { "Content-Type": "application/json" },
        }
      );

      const batch: IOmniStakingResponse = await response.data;

      if (!batch.data || batch.data.tokenBalances.length == 0) {
        dataAvailable = false;
      }

      batch.data.tokenBalances.forEach((data: IOmniStakingData) => {
        rows.push({
          block_number: blocks.blockNumber,
          timestamp,
          user_address: data.id,
          token_address: tokenAddress,
          token_balance: BigInt(data.balance_omni),
          token_symbol: symbol,
          usd_price: 0,
        });

        lastAddress = data.id;
      });

      console.log(
        `Processed ${rows.length} rows for single stakers. Last address is ${lastAddress}`
      );
    } while (dataAvailable);

    return rows.filter((r) => r.token_balance > 1);
  } catch (error) {
    const errorMessage = `Failed to fetch ZERO stakers data for block ${
      blocks.blockNumber
    }: ${error instanceof Error ? error.message : error}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
};
