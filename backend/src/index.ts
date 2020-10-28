import "reflect-metadata";
import "dotenv-safe/config";
import Redis from "ioredis";
import cors from "cors";
import { createConnection } from "typeorm";
import express from "express";
import connectRedis from "connect-redis";
import session from "express-session";
import {
  DATABASE_URL,
  REDIS_URL,
  ORIGIN,
  COOKIE_NAME,
  SESSION_SECRET,
  PORT,
  __prod__,
} from "./constants";
import path from "path";
import { ApolloServer } from "apollo-server-express";
import { buildSchema } from "type-graphql";
import { Auth } from "./resolvers/me";
import { User } from "./entities/index";

const main = async () => {
  // SET UP CONNECTION TO THE DATABASE THROUGH TYPEORM
  await createConnection({
    type: "postgres",
    entities: [User],
    url: DATABASE_URL,
    logging: true,
    synchronize: true,
    migrations: [path.join(__dirname, "./migrations/*")],
  });

  const app = express();

  const RedisStore = connectRedis(session);
  const redis = new Redis(REDIS_URL);

  //app.set("trust proxy", 1);
  app.use(cors());
  app.use(
    session({
      name: COOKIE_NAME,
      store: new RedisStore({
        client: redis,
        disableTouch: true,
      }),
      cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 365 * 10, // 10 years
        httpOnly: true,
        sameSite: "lax", // csrf
        // secure: __prod__, // cookie only works in https
        //domain: __prod__ ? ".mydomain.com" : undefined,
      },
      saveUninitialized: false,
      secret: SESSION_SECRET,
      resave: false,
    })
  );

  const apolloServer = new ApolloServer({
    schema: await buildSchema({
      resolvers: [Auth],
      validate: false,
    }),
    context: ({ req, res }) => ({
      req,
      res,
      redis,
    }),
  });

  apolloServer.applyMiddleware({
    app,
    cors: false,
  });

  app.listen(5555, (e) => {
    console.log(`SERVER STARING AT PORT: ${5555}`);
  });
};

main().catch((e) => {
  console.log(e);
  console.error("CANNOT INITIALIZE THE SERVER");
});
