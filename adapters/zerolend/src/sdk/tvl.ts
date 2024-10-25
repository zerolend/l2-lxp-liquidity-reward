import axios from "axios";
import rateLimit from "axios-rate-limit";

import {
  BlockData,
  IUserReserve,
  ILPResponse,
  OutputDataSchemaRow,
} from "./types";

const axiosInstance = rateLimit(axios.create(), {
  maxRequests: 5,
  perMilliseconds: 1000,
});

const queryURL =
  "https://api.goldsky.com/api/public/project_clsk1wzatdsls01wchl2e4n0y/subgraphs/zerolend-linea/1.0.0/gn";

export const getUserTVLLegacyByBlock = async (
  blocks: BlockData
): Promise<OutputDataSchemaRow[]> => {
  try {
    const timestamp = blocks.blockTimestamp;
    const first = 1000;
    const rows: OutputDataSchemaRow[] = [];
    let skip = 0;
    let lastAddress = "0x0000000000000000000000000000000000000000";

    console.log("working on legacy lending pool data");
    let dataAvailable = true;

    do {
      const query = `{
      userReserves(
        block: {number: ${blocks.blockNumber}}
        where: {or: [{currentTotalDebt_gt: 0}, {currentATokenBalance_gt: 0}]}
        first: ${first}
        skip: ${skip},
      ) {
        user {
          id
        }
        currentTotalDebt
        currentATokenBalance
        reserve {
          underlyingAsset
          symbol
          name
        }
        liquidityRate
      }
    }`;

      const response = await axiosInstance.post(
        queryURL,
        { query },
        {
          headers: { "Content-Type": "application/json" },
        }
      );

      const batch: ILPResponse = await response.data;

      if (!batch.data || batch.data.userReserves.length == 0) {
        dataAvailable = false;
      }

      batch.data.userReserves.forEach((data: IUserReserve) => {
        const balance =
          BigInt(data.currentATokenBalance) - BigInt(data.currentTotalDebt);

        if (balance !== 0n)
          rows.push({
            block_number: blocks.blockNumber,
            timestamp,
            user_address: data.user.id,
            token_address: data.reserve.underlyingAsset,
            token_balance: BigInt(balance),
            token_symbol: data.reserve.symbol,
            usd_price: 0,
          });

        lastAddress = data.user.id;
      });

      skip += batch.data.userReserves.length;
      console.log(
        `Processed ${rows.length} rows. Last address is ${lastAddress}`
      );
    } while (dataAvailable);
    return rows;
  } catch (error) {
    const errorMessage = `Failed to fetch legacy lending pool data for block ${
      blocks.blockNumber
    }: ${error instanceof Error ? error.message : error}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
};
