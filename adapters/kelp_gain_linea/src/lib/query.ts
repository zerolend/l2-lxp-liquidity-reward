import { request } from "graphql-request";
import { gql } from "graphql-request";
import { fetchAllPendleShare } from "./pendle";
import { fetchAllBalancerShare } from "./balancer";
import { BigNumber } from "bignumber.js";
import { ethers } from "ethers";
import { agETH, AGETH_BLOCK, balancerVault, pendleSYAgETH } from "./utils";
import {
  fetchSpectraPoolShares,
  SPECTRA_LP_ADDRESS,
  SPECTRA_YT_ADDRESS
} from "./spectra";
import { agEthToRsEth, rsEthToAgEth } from "./fetcher";

const MULTICALL_BATCH_SIZE = 1000;

const Blacklisted = [
  agETH,
  balancerVault,
  pendleSYAgETH,
  SPECTRA_LP_ADDRESS,
  SPECTRA_YT_ADDRESS
];
export const agETHSubgraph =
  "https://api.studio.thegraph.com/query/70817/ageth-lp/version/latest";
interface IDwise {
  id: string;
}

export async function subgraphFetchAllById<T extends IDwise>(
  endpoint: string,
  query: string,
  collection: string,
  variables: Record<string, unknown>
): Promise<T[]> {
  const data: T[] = [];
  let lastId = "0x0000000000000000000000000000000000000000";
  while (true) {
    const resp: { [collection: string]: T[] } = await request(endpoint, query, {
      ...variables,
      lastId
    });

    const batch: T[] = resp[collection];
    if (batch.length == 0) {
      break;
    }

    const last = batch[batch.length - 1];
    lastId = last.id;

    data.push(...batch);

    if (batch.length < MULTICALL_BATCH_SIZE) {
      break;
    }
  }
  return data;
}
export async function subgraphFetchOne<T>(
  endpoint: string,
  query: string,
  collection: string,
  variables: Record<string, unknown>
): Promise<T> {
  const resp: { [collection: string]: T } = await request(
    endpoint,
    query,
    variables
  );
  return resp[collection];
}

interface GraphQLQuery {
  query: string;
  collection: string;
}

export type UserBalanceSubgraphEntry = {
  id: string;
  balance: string;
};

export const USER_BALANCES_QUERY: GraphQLQuery = {
  query: gql`
    query PositionsQuery($block: Int, $lastId: ID!, $blacklisted: [ID!]!) {
      userBalances(
        where: { balance_gt: "0", id_gt: $lastId, id_not_in: $blacklisted }
        block: { number: $block }
        orderBy: id
        orderDirection: asc
        first: 1000
      ) {
        id
        balance
      }
    }
  `,
  collection: "userBalances"
};

export async function getAllAgEthHodlers(
  blockNumber: number,
  timestamp: number
) {
  if (blockNumber < AGETH_BLOCK) {
    return [];
  }
  const positions = await subgraphFetchAllById<UserBalanceSubgraphEntry>(
    agETHSubgraph,
    USER_BALANCES_QUERY.query,
    USER_BALANCES_QUERY.collection,
    {
      block: blockNumber,
      lastId: "0x0000000000000000000000000000000000000000",
      blacklisted: Blacklisted
    }
  );

  const pendleShares = await fetchAllPendleShare(blockNumber, timestamp);
  const balancerShares = await fetchAllBalancerShare(blockNumber);

  let agETHHodlers = positions.reduce((acc, s) => acc + BigInt(s.balance), 0n);

  let totalPendleShares = pendleShares.reduce(
    (acc, s) => acc + BigInt(s.share),
    0n
  );

  let totalBalancerShares = balancerShares.reduce(
    (acc, s) => acc.plus(BigNumber(s.balance)),
    new BigNumber(0)
  );

  let spectraShare = await fetchSpectraPoolShares(blockNumber);
  let spectraShare_ = spectraShare.reduce(
    (acc, s) => acc.plus(BigNumber(s.balance)),
    new BigNumber(0)
  );

  let spectraAgETHBalance = ethers.utils.formatEther(
    spectraShare_.toFixed().toString()
  );

  console.log(
    `Hodlers agETH: ${ethers.utils.formatEther(agETHHodlers.toString())}`
  );
  console.log(
    `Pendle agETH: ${ethers.utils.formatEther(totalPendleShares.toString())}`
  );
  console.log(
    `Balancer agETH: ${ethers.utils
      .formatEther(totalBalancerShares.toFixed().toString())
      .toString()} `
  );
  console.log(`Spectra agETH: ${spectraAgETHBalance.toString()} `);

  positions.push(
    ...pendleShares.map((e) => {
      return {
        id: e.user,
        balance: e.share
      };
    })
  );

  positions.push(
    ...balancerShares.map((e) => {
      return {
        id: e.userAddress.id,
        balance: e.balance
      };
    })
  );

  positions.push(...spectraShare);

  const balanceMap = new Map<string, bigint>();
  for (const balance of [...positions]) {
    balanceMap.set(
      balance.id,
      (balanceMap.get(balance.id) || 0n) + BigInt(balance.balance)
    );
  }

  const balances = Array.from(balanceMap, ([id, balance]) => ({
    id,
    balance: balance.toString()
  }));

  const allAgETH = balances.reduce((acc, s) => acc + BigInt(s.balance), 0n);
  console.log(`TOTAL agETH: ${ethers.utils.formatEther(allAgETH).toString()} `);
  return balances;
}
