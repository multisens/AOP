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
    serviceIcon: `<svg style="position: absolute; left: 20%; top: -10%; transform: scale(100%);">${CEFET.svgLogo}</svg>`,
    initialMediaURL: `http://localhost:${_PORT}/cefet`,
  },
  {
    serviceId: 1,
    serviceName: "UFF TV",
    serviceIcon:
      '<svg style="position: absolute; left: 25%; top: 10%; transform: scale(150%);">' +
      '<path transform="translate(-1.96875,1.15625)" inkscape:connector-curvature="0" id="path3048" d="m 99.40625,-1.15625 c -12.408054,-6e-7 -22.499997,10.0919484 -22.5,22.5 l 0,0.53125 0,15.09375 -23.0625,0 0,32.5625 -0.03125,0.5 c -0.246865,3.707996 -3.22521,6.625 -6.84375,6.625 -3.618034,-2e-6 -6.564884,-2.914791 -6.8125,-6.625 l -0.03125,-0.5 0,-32.5625 -38.15625,0 0,16.03125 22.0625,0 0,16.53125 0,0.53125 c 0,12.664481 10.272113,22.968749 22.9375,22.96875 12.665385,-2e-6 22.968753,-10.303368 22.96875,-22.96875 l 0,-0.53125 0,-16.53125 6.96875,0 0,40.03125 15.34375,0 0,-40.03125 29.625,0 0,40.03125 15.34375,0 0,-40.03125 44.65625,0 0,-16.03125 -44.65625,0 0,-15.09375 0.0312,0 0.0312,-0.5 c 0.25591,-3.745927 3.30223,-6.6875 7.0625,-6.6875 3.76026,0 6.83802,2.944279 7.09375,6.6875 l 0.0312,0.5 0,9.125 15.375,0 0,-9.125 0,-0.53125 c -1e-5,-12.4080514 -10.09194,-22.4999995 -22.5,-22.5 -12.40806,-6e-7 -22.46875,10.0928498 -22.46875,22.5 0,-12.4071503 -10.0607,-22.4999994 -22.46875,-22.5 z m 0,15.84375 c 3.76847,0 6.81584,2.932396 7.0625,6.6875 l 0.0312,0.5 0,9.125 15.375,0 0,5.96875 -29.625,0 0,-15.09375 0.03125,0 0.03125,-0.5 c 0.245979,-3.752902 3.324834,-6.6875 7.09375,-6.6875 z" style="display:inline;fill:#003461;fill-opacity:1;fill-rule:evenodd;stroke:none" />' +
      "</svg>",
    initialMediaURL: `http://localhost:${_PORT}/uff`,
  },
  {
    serviceId: 2,
    serviceName: "Eduplay Quiz",
    serviceIcon: `
    <svg version="1.0" xmlns="http://www.w3.org/2000/svg"
 width="400.000000pt" height="125.000000pt" viewBox="0 0 400.000000 125.000000"
 preserveAspectRatio="xMidYMid meet"
 style="position: absolute; transform: scale(60%); left: -35%; top: -13%;">

<g transform="translate(0.000000,125.000000) scale(0.100000,-0.100000)"
fill="#000000" stroke="none">
<path d="M1175 1236 c-57 -21 -121 -94 -134 -154 -17 -80 18 -181 75 -219 l24
-15 0 -418 c0 -372 2 -419 16 -424 20 -8 168 -8 188 0 14 5 16 52 16 424 l0
419 569 -317 570 -317 6 -37 c11 -62 56 -122 116 -152 88 -43 176 -30 244 39
89 88 87 216 -5 310 l-40 41 -2 414 -3 415 -100 0 -100 0 -5 -422 -5 -421
-569 316 -569 317 -12 48 c-15 59 -39 93 -91 130 -50 35 -130 44 -189 23z"/>
<path d="M0 626 l0 -613 55 -6 c30 -3 80 -3 110 0 l55 6 0 228 0 229 85 0 84
0 39 -53 c49 -65 133 -206 192 -319 l44 -86 59 -5 c33 -3 83 -3 112 0 l53 6
-21 46 c-34 78 -126 241 -192 342 l-63 96 42 13 c100 30 181 101 204 178 18
59 15 288 -4 344 -21 64 -75 122 -140 153 -95 45 -180 55 -460 55 l-254 0 0
-614z m566 403 c66 -33 84 -61 91 -144 7 -89 -8 -146 -47 -179 -43 -36 -85
-45 -247 -52 l-143 -7 0 208 0 208 149 -5 c132 -4 154 -8 197 -29z"/>
<path d="M3130 626 l0 -614 49 -7 c27 -4 74 -4 105 0 l56 7 0 218 0 217 168 6
c241 9 347 40 425 126 55 61 70 124 65 289 -3 112 -7 145 -24 182 -41 90 -125
146 -261 175 -49 11 -139 15 -325 15 l-258 0 0 -614z m496 423 c123 -22 154
-65 154 -211 0 -73 -4 -99 -19 -124 -36 -59 -129 -84 -313 -84 l-108 0 0 215
0 215 113 0 c62 0 140 -5 173 -11z"/>
</g>
</svg>
    `,
    initialMediaURL: `http://localhost:${_PORT}/eduplay`,
  },
];

mqttClient.publish(mqttClient.TOPIC.services, JSON.stringify(services), true);

// notify loading is complete
if (process.send) {
  process.send("ready");
}
