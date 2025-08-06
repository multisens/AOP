import * as dotenv from "dotenv";
import express, { Application, Request, Response, NextFunction } from "express";
import * as mqttClient from "./mqtt-client";
dotenv.config();

const _PORT = process.env.PORT || 8081;

// modules
import cefet from "./modules/cefet";
import uff from "./modules/uff";

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

app.listen(_PORT, () => {
  console.log(`App running on port: ${_PORT}`);
});

// Send avaliable services to the Broker
let services = [
  {
    serviceId: 0,
    serviceName: "CEFET/RJ TV",
    serviceIcon:
      '<svg style="position: absolute; left: -46%; top: -68%; transform: scale(42%);">' +
      '<path style="fill:#003461;fill-opacity:1" d="m 300.2234,384.55751 c -11.82503,-5.72511 -18.40396,-14.80762 -19.18356,-26.48381 -0.41716,-6.24775 0.2709,-8.63439 17.72997,-61.5 9.99018,-30.25 19.08734,-57.5875 20.2159,-60.75 l 2.05192,-5.75 34.40585,0 c 32.20656,0 34.6516,0.12537 38.25046,1.96138 5.00594,2.55384 9.97711,7.58125 11.87405,12.0084 1.61023,3.75802 2.01373,13.09865 0.83223,19.26541 l -0.71564,3.73518 -29.70746,0.26482 -29.70747,0.26481 -20,59.74923 c -11,32.86208 -20.225,59.73315 -20.5,59.71348 -0.275,-0.0197 -2.77081,-1.13517 -5.54625,-2.4789 z m 12.76902,1.26619 c 0.24021,-0.6875 3.09761,-9.0125 6.34977,-18.5 l 5.91303,-17.25 25.25722,0 c 13.89146,0 25.25721,0.29115 25.25721,0.64701 0,1.05285 -6.59236,8.78421 -11.38426,13.35119 -10.20338,9.72444 -22.56833,16.42023 -37.9161,20.53207 -10.31309,2.76299 -14.137,3.10908 -13.47687,1.21973 z m 19.80328,-59.5 c 0.0143,-0.4125 3.12817,-9.3 6.91964,-19.75 l 6.89359,-19 23.16205,0 c 30.43999,0 29.79183,-0.74711 19.72231,22.73322 -3.06786,7.1537 -6.50417,13.60237 -7.84213,14.71673 -2.22185,1.85053 -3.94022,1.98574 -25.63151,2.01678 -12.7875,0.0183 -23.23827,-0.30423 -23.22395,-0.71673 z m -70.02605,-57.82295 c 0,-1.77446 9.89402,-14.98246 14.45339,-19.29452 8.70425,-8.23212 22.57169,-15.87768 33.90722,-18.69412 2.49564,-0.62007 2.78393,-0.47011 2.25961,1.17542 -0.33055,1.03739 -3.23159,9.76117 -6.44676,19.38617 l -5.84577,17.5 -19.16385,0.27159 c -10.54011,0.14938 -19.16384,-0.006 -19.16384,-0.34454 z" id="path3050" inkscape:connector-curvature="0" transform="translate(-262.76965,-230.0737)" />' +
      "</svg>",
    initialMediaURL: `http://localhost:${process.env.PORT}/cefet`,
  },
  {
    serviceId: 1,
    serviceName: "UFF TV",
    serviceIcon:
      '<svg style="position: absolute; left: -42%; top: -40%; transform: scale(66%);">' +
      '<path transform="translate(-1.96875,1.15625)" inkscape:connector-curvature="0" id="path3048" d="m 99.40625,-1.15625 c -12.408054,-6e-7 -22.499997,10.0919484 -22.5,22.5 l 0,0.53125 0,15.09375 -23.0625,0 0,32.5625 -0.03125,0.5 c -0.246865,3.707996 -3.22521,6.625 -6.84375,6.625 -3.618034,-2e-6 -6.564884,-2.914791 -6.8125,-6.625 l -0.03125,-0.5 0,-32.5625 -38.15625,0 0,16.03125 22.0625,0 0,16.53125 0,0.53125 c 0,12.664481 10.272113,22.968749 22.9375,22.96875 12.665385,-2e-6 22.968753,-10.303368 22.96875,-22.96875 l 0,-0.53125 0,-16.53125 6.96875,0 0,40.03125 15.34375,0 0,-40.03125 29.625,0 0,40.03125 15.34375,0 0,-40.03125 44.65625,0 0,-16.03125 -44.65625,0 0,-15.09375 0.0312,0 0.0312,-0.5 c 0.25591,-3.745927 3.30223,-6.6875 7.0625,-6.6875 3.76026,0 6.83802,2.944279 7.09375,6.6875 l 0.0312,0.5 0,9.125 15.375,0 0,-9.125 0,-0.53125 c -1e-5,-12.4080514 -10.09194,-22.4999995 -22.5,-22.5 -12.40806,-6e-7 -22.46875,10.0928498 -22.46875,22.5 0,-12.4071503 -10.0607,-22.4999994 -22.46875,-22.5 z m 0,15.84375 c 3.76847,0 6.81584,2.932396 7.0625,6.6875 l 0.0312,0.5 0,9.125 15.375,0 0,5.96875 -29.625,0 0,-15.09375 0.03125,0 0.03125,-0.5 c 0.245979,-3.752902 3.324834,-6.6875 7.09375,-6.6875 z" style="display:inline;fill:#003461;fill-opacity:1;fill-rule:evenodd;stroke:none" />' +
      "</svg>",
    initialMediaURL: `http://localhost:${process.env.PORT}/uff`,
  },
];

mqttClient.publish(mqttClient.TOPIC.services, JSON.stringify(services), true);

// notify loading is complete
if (process.send) {
  process.send("ready");
}
