import * as dotenv from 'dotenv';
import express, { Router, Request, Response } from 'express';
import { readFileSync } from 'fs';
import * as mqttClient from '../../mqtt-client';
import { join } from 'path';
import * as ncl_app from './app-data';
import NclApp from './ncl-app';
dotenv.config();
const router:Router = express.Router();


type mydata = {
    serviceId: number,
    serviceName: string,
    svgLogo: string,
    current_app?: NclApp | null
};
export const DATA:mydata = {
    serviceId: 0,
    serviceName: 'CEFET/RJ TV',
    svgLogo: '<path style="fill:#003461;fill-opacity:1" d="m 300.2234,384.55751 c -11.82503,-5.72511 -18.40396,-14.80762 -19.18356,-26.48381 -0.41716,-6.24775 0.2709,-8.63439 17.72997,-61.5 9.99018,-30.25 19.08734,-57.5875 20.2159,-60.75 l 2.05192,-5.75 34.40585,0 c 32.20656,0 34.6516,0.12537 38.25046,1.96138 5.00594,2.55384 9.97711,7.58125 11.87405,12.0084 1.61023,3.75802 2.01373,13.09865 0.83223,19.26541 l -0.71564,3.73518 -29.70746,0.26482 -29.70747,0.26481 -20,59.74923 c -11,32.86208 -20.225,59.73315 -20.5,59.71348 -0.275,-0.0197 -2.77081,-1.13517 -5.54625,-2.4789 z m 12.76902,1.26619 c 0.24021,-0.6875 3.09761,-9.0125 6.34977,-18.5 l 5.91303,-17.25 25.25722,0 c 13.89146,0 25.25721,0.29115 25.25721,0.64701 0,1.05285 -6.59236,8.78421 -11.38426,13.35119 -10.20338,9.72444 -22.56833,16.42023 -37.9161,20.53207 -10.31309,2.76299 -14.137,3.10908 -13.47687,1.21973 z m 19.80328,-59.5 c 0.0143,-0.4125 3.12817,-9.3 6.91964,-19.75 l 6.89359,-19 23.16205,0 c 30.43999,0 29.79183,-0.74711 19.72231,22.73322 -3.06786,7.1537 -6.50417,13.60237 -7.84213,14.71673 -2.22185,1.85053 -3.94022,1.98574 -25.63151,2.01678 -12.7875,0.0183 -23.23827,-0.30423 -23.22395,-0.71673 z m -70.02605,-57.82295 c 0,-1.77446 9.89402,-14.98246 14.45339,-19.29452 8.70425,-8.23212 22.57169,-15.87768 33.90722,-18.69412 2.49564,-0.62007 2.78393,-0.47011 2.25961,1.17542 -0.33055,1.03739 -3.23159,9.76117 -6.44676,19.38617 l -5.84577,17.5 -19.16385,0.27159 c -10.54011,0.14938 -19.16384,-0.006 -19.16384,-0.34454 z" id="path3050" inkscape:connector-curvature="0" transform="translate(-262.76965,-230.0737)" />'
}

const topic = {
    currentApp : mqttClient.parseTopic(
                    mqttClient.TOPIC.current_app,
                    {
                        serviceId: String(DATA.serviceId)
                    }
                )
}

const executeVideo = `
    const video = document.getElementById('tvvideo');
    createHLSPlayer('/media/carnaval/stream/carnaval.m3u8', video);
`;
const bootstrapScript = `
function fullscreen() {
    window.location.href = '/cefet/fullscreen';
}
function beforeBack() {
    postFrameMessage({ type: 'publish', topic: '${topic.currentApp}', message: '', retain: true });
}`;
const fullscreenScript = `


async function findSepe() {
  try {
    const response = await fetch(
      "http://localhost:44642/tv3/sensory-effect-renderers"
    );

    console.log("Response:", response);

    if (!response.ok) {
      console.log(response)
      return null;
    }

    const data = await response.json();
    if (!data || !data.renderers || data.renderers.length === 0) {
      return null;
    }

    sepe = data.renderers[0];
    return data.renderers[0];
  } catch (error) {
    console.error("Error fetching SEPE:", error);
    return null;
  }
}

async function playLightEffect(sepe, action, color) {
  const body = {
    effectType: "LightType",
    action: action,
    properties: [{ name: "color", value: color }],
  };

  const response = await fetch(
    "http://localhost:44642/tv3/sensory-effect-renderers/" + sepe.id,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if(!response.ok) {
  console.warn(response)
  }
}

async function handleKey(k) {
    if (k == 'Escape') {
        const sepe = await findSepe();

        console.log("Turning effects off before quitting page.")
        await playLightEffect(sepe, "stop", [0,0,0]);

        window.location.href = '/cefet?prev=fullscreen';
    }
}`;
const videosync = readFileSync(join(__dirname, 'handleFragChange.js'), 'utf-8');


router.get('/', (req:Request, res:Response) => {
    if (req.query.prev == 'fullscreen' && DATA.current_app != null) {
        DATA.current_app?.stopApp();
        DATA.current_app?.terminate();
        DATA.current_app = null;
    }
    if (req.query.prev != 'fullscreen' && DATA.current_app == null) {
        DATA.current_app = new NclApp('100', String(DATA.serviceId), ncl_app.app_path, structuredClone(ncl_app.doc));
        mqttClient.publish(topic.currentApp, DATA.current_app.id, true);
    }

    res.render('bootstrap', {
        logo: `<svg style="position: absolute; left: 50%; top: 50%; transform: scale(200%);">${DATA.svgLogo}</svg>`,
        name: 'CEFET/RJ TV',
        details: '<img id="details" style="left: 4%; top: 40%; width: 96%; height: 23%;" src="/media/carnaval/details.png"/>' +
                 '<img id="connect" style="left: 3%; top: 72%; width: 97%; height: 7%;" moveup="tvvideo" movedown="back" src="/media/carnaval/vrButton.png"/>',
        backMove: 'moveup="connect"',
        usermove: 'movedown="tvvideo"',
        mainVideoMove: 'moveup="user" movedown="connect"',
        info: '/media/carnaval/info.png',
        mainVideoURL: '',
        script: executeVideo + bootstrapScript
    });
});


router.get('/fullscreen', (req:Request, res:Response) => {
    DATA.current_app?.startApp();

    res.render('fullscreen', {
        mainVideoURL: '',
        script: executeVideo + fullscreenScript + videosync
    });
});

export default router;