import * as dotenv from "dotenv";
import express, { Application, Request, Response, NextFunction } from "express";
import * as mqttClient from "./mqtt-client";
dotenv.config();

const _PORT = process.env.PORT || 8081;

// modules
import cefet, { DATA as CEFET } from "./modules/cefet";
import uff from "./modules/uff";
import eduplay from "./modules/eduplay";

// middleware configuration
const app: Application = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static("public"));
app.use(express.static(`${process.env.USER_DATA_PATH}/thumbs`));
app.set("view engine", "ejs");
app.set("views", "src/views");

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

// use routes
app.use("/cefet", cefet);
app.use("/uff", uff);
app.use("/eduplay", eduplay);

app.listen(_PORT, () => {
  console.log(`App running on port: ${_PORT}`);
});

// Send avaliable services to the Broker
let services = [
  {
    serviceId: CEFET.serviceId,
    serviceName: CEFET.serviceName,
    serviceIcon: `<svg style="position: absolute; left: -46%; top: -68%; transform: scale(42%);">${CEFET.svgLogo}</svg>`,
    initialMediaURL: `http://localhost:${_PORT}/cefet`,
  },
  {
    serviceId: 1,
    serviceName: "UFF TV",
    serviceIcon:
      '<svg style="position: absolute; left: -42%; top: -40%; transform: scale(66%);">' +
      '<path transform="translate(-1.96875,1.15625)" inkscape:connector-curvature="0" id="path3048" d="m 99.40625,-1.15625 c -12.408054,-6e-7 -22.499997,10.0919484 -22.5,22.5 l 0,0.53125 0,15.09375 -23.0625,0 0,32.5625 -0.03125,0.5 c -0.246865,3.707996 -3.22521,6.625 -6.84375,6.625 -3.618034,-2e-6 -6.564884,-2.914791 -6.8125,-6.625 l -0.03125,-0.5 0,-32.5625 -38.15625,0 0,16.03125 22.0625,0 0,16.53125 0,0.53125 c 0,12.664481 10.272113,22.968749 22.9375,22.96875 12.665385,-2e-6 22.968753,-10.303368 22.96875,-22.96875 l 0,-0.53125 0,-16.53125 6.96875,0 0,40.03125 15.34375,0 0,-40.03125 29.625,0 0,40.03125 15.34375,0 0,-40.03125 44.65625,0 0,-16.03125 -44.65625,0 0,-15.09375 0.0312,0 0.0312,-0.5 c 0.25591,-3.745927 3.30223,-6.6875 7.0625,-6.6875 3.76026,0 6.83802,2.944279 7.09375,6.6875 l 0.0312,0.5 0,9.125 15.375,0 0,-9.125 0,-0.53125 c -1e-5,-12.4080514 -10.09194,-22.4999995 -22.5,-22.5 -12.40806,-6e-7 -22.46875,10.0928498 -22.46875,22.5 0,-12.4071503 -10.0607,-22.4999994 -22.46875,-22.5 z m 0,15.84375 c 3.76847,0 6.81584,2.932396 7.0625,6.6875 l 0.0312,0.5 0,9.125 15.375,0 0,5.96875 -29.625,0 0,-15.09375 0.03125,0 0.03125,-0.5 c 0.245979,-3.752902 3.324834,-6.6875 7.09375,-6.6875 z" style="display:inline;fill:#003461;fill-opacity:1;fill-rule:evenodd;stroke:none" />' +
      "</svg>",
    initialMediaURL: `http://localhost:${_PORT}/uff`,
  },
  {
    serviceId: 2,
    serviceName: "Eduplay Quiz",
    serviceIcon: "",
    initialMediaURL: `http://localhost:${_PORT}/eduplay`,
  }
];

mqttClient.publish(mqttClient.TOPIC.services, JSON.stringify(services), true);

// notify loading is complete
if (process.send) {
  process.send("ready");
}
