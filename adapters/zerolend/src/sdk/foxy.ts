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
  "https://api.goldsky.com/api/public/project_clsk1wzatdsls01wchl2e4n0y/subgraphs/zerolend-linea-foxy/1.0.0/gn";

export const getUserTVLFoxyByBlock = async (
  blocks: BlockData
): Promise<OutputDataSchemaRow[]> => {
  try {
    const timestamp = blocks.blockTimestamp;
    const first = 1000;
    const rows: OutputDataSchemaRow[] = [];

    let lastAddress = "0x0000000000000000000000000000000000000000";

    const remapFoxy = (addr: string) =>
      addr == "0x5fbdf89403270a1846f5ae7d113a989f850d1566"
        ? "0x000000000000000000000000000000000000foxy"
        : addr;

    console.log("working on foxy data");
    let dataAvailable = true;
    do {
      const query = `{
      userReserves(
        block: {number: ${blocks.blockNumber}}
        where: {and: [{or: [{currentTotalDebt_gt: 0}, {currentATokenBalance_gt: 0}]}, {user_gt: "${lastAddress}"}]}
        first: ${first}
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
        dataAvailable = false; // Set to false if fewer than `first` items are returned
      }

      batch.data.userReserves.forEach((data: IUserReserve) => {
        const balance =
          BigInt(data.currentATokenBalance) - BigInt(data.currentTotalDebt);

        if (balance !== 0n)
          rows.push({
            block_number: blocks.blockNumber,
            timestamp,
            user_address: data.user.id,
            token_address: remapFoxy(data.reserve.underlyingAsset),
            token_balance: BigInt(balance),
            token_symbol: data.reserve.symbol,
            usd_price: 0,
          });

        lastAddress = data.user.id;
      });

      console.log(
        `Processed ${rows.length} rows. Last address is ${lastAddress}`
      );
    } while (dataAvailable);

    return rows;
  } catch (error) {
    const errorMessage = `Failed to fetch TVL Foxy data for block ${
      blocks.blockNumber
    }: ${error instanceof Error ? error.message : error}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
};
