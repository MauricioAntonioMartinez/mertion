import { createWithApollo } from "./createWithApollo";
import { ApolloClient, InMemoryCache } from "@apollo/client";
import { NextPageContext } from "next";
import { split } from "@apollo/client";
import { getMainDefinition } from "@apollo/client/utilities";
import { WebSocketLink } from "@apollo/client/link/ws";
import { createUploadLink } from "apollo-upload-client";
import { SubscriptionClient } from "subscriptions-transport-ws";
import { MertsResponse } from "../generated/graphql";

let URI =
  typeof window === "undefined"
    ? process.env.SERVER_URL
    : process.env.NEXT_PUBLIC_API_URL;
let URI_SW = process.env.NEXT_PUBLIC_API_WS as string;

if (process.env.VERCEL_ENV !== "development") {
  URI = process.env.NEXT_PUBLIC_API_URL_PRODUCTION;
  URI_SW = process.env.NEXT_PUBLIC_API_WS_PRODUCTION as string;
}

const buildLink = (ctx: NextPageContext, headers: Record<string, string>) => {
  const uploadLInk = createUploadLink({
    headers,
    uri: URI,
    credentials: "include",
  });

  if (typeof window === "undefined") return uploadLInk;

  const client = new SubscriptionClient(URI_SW, {
    reconnect: true,
    connectionParams: {
      headers,
    },
  });

  const wsLink = new WebSocketLink(client);

  const link = split(
    ({ query }) => {
      const def = getMainDefinition(query);
      return (
        def.kind === "OperationDefinition" && def.operation === "subscription"
      );
    },
    wsLink,
    uploadLInk
  );

  return link;
};

const createClient = (ctx: NextPageContext) => {
  const headers = {
    cookie:
      (typeof window === "undefined" ? ctx?.req?.headers.cookie : undefined) ||
      "",
  };

  return new ApolloClient({
    link: buildLink(ctx, headers),
    uri: URI,
    credentials: "include",
    headers,
    cache: new InMemoryCache({
      typePolicies: {
        Query: {
          fields: {
            merts: {
              keyArgs: ["mertId", "cursor"],
              merge(
                newer: MertsResponse = { merts: [], hasMore: true },
                older: MertsResponse
              ): MertsResponse {
                if (older.merts.length === 1) {
                  return {
                    hasMore: older.hasMore,
                    merts: [...older.merts, ...newer.merts],
                  };
                }
                if (older.merts.length > 0) {
                  const isValidMerge = newer.merts.find(
                    (e: any) => e?.__ref === (older.merts[0] as any)?.__ref
                  );
                  if (isValidMerge) return newer;
                }
                console.log("OLDER", older);
                console.log("NEWER", newer);
                return {
                  hasMore: older.hasMore,
                  merts: [...newer.merts, ...older.merts],
                };
              },
            },
          },
        },
      },
    }),
  });
};

export const withApollo = createWithApollo(createClient);
