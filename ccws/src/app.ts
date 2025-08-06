import express, { Application, Request, Response, NextFunction } from "express";

// import modules routes
import dtvAPI from "./modules/dtv-api";
import appfilesAPI from "./modules/appfiles-api";
import userAPI from "./modules/user-api";
import remotedevAPI from "./modules/remotedevice-api";
import sensoryEffectRenderersAPI from "./modules/sensory-effect-renderers-api";

// middleware configuration
const app: Application = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// allowing local clients to connect to the server
app.use(function (req: Request, res: Response, next: NextFunction) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS, PUT, PATCH, DELETE"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-Requested-With,content-type"
  );
  next();
});

app.use("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    message: "CCWS is running",
  });
});
app.use("/tv3/current-service/apps", appfilesAPI);
app.use("/tv3/current-service/users", userAPI);
app.use("/tv3/remote-device", remotedevAPI);
app.use("/tv3/sensory-effect-renderers", sensoryEffectRenderersAPI);
app.use("/tv3", dtvAPI);

export default app;
