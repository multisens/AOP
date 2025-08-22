import * as dotenv from "dotenv";
import express, { Router, Request, Response } from "express";
import * as mqttClient from "../../mqtt-client";
dotenv.config();
const router: Router = express.Router();

const DATA = {
  serviceLogo:
    '<svg style="position: absolute; left: 50%; top: 70%; transform: scale(250%);">' +
    '<path transform="translate(-1.96875,1.15625)" inkscape:connector-curvature="0" id="path3048" d="m 99.40625,-1.15625 c -12.408054,-6e-7 -22.499997,10.0919484 -22.5,22.5 l 0,0.53125 0,15.09375 -23.0625,0 0,32.5625 -0.03125,0.5 c -0.246865,3.707996 -3.22521,6.625 -6.84375,6.625 -3.618034,-2e-6 -6.564884,-2.914791 -6.8125,-6.625 l -0.03125,-0.5 0,-32.5625 -38.15625,0 0,16.03125 22.0625,0 0,16.53125 0,0.53125 c 0,12.664481 10.272113,22.968749 22.9375,22.96875 12.665385,-2e-6 22.968753,-10.303368 22.96875,-22.96875 l 0,-0.53125 0,-16.53125 6.96875,0 0,40.03125 15.34375,0 0,-40.03125 29.625,0 0,40.03125 15.34375,0 0,-40.03125 44.65625,0 0,-16.03125 -44.65625,0 0,-15.09375 0.0312,0 0.0312,-0.5 c 0.25591,-3.745927 3.30223,-6.6875 7.0625,-6.6875 3.76026,0 6.83802,2.944279 7.09375,6.6875 l 0.0312,0.5 0,9.125 15.375,0 0,-9.125 0,-0.53125 c -1e-5,-12.4080514 -10.09194,-22.4999995 -22.5,-22.5 -12.40806,-6e-7 -22.46875,10.0928498 -22.46875,22.5 0,-12.4071503 -10.0607,-22.4999994 -22.46875,-22.5 z m 0,15.84375 c 3.76847,0 6.81584,2.932396 7.0625,6.6875 l 0.0312,0.5 0,9.125 15.375,0 0,5.96875 -29.625,0 0,-15.09375 0.03125,0 0.03125,-0.5 c 0.245979,-3.752902 3.324834,-6.6875 7.09375,-6.6875 z" style="display:inline;fill:#003461;fill-opacity:1;fill-rule:evenodd;stroke:none" />' +
    "</svg>",
  targetUUID: "4b58baf8-65ce",
  currentUser: "",
};

function setCurrentUser(uuid: string) {
  DATA.currentUser = uuid;
}
mqttClient.addTopicHandler(mqttClient.TOPIC.current_user, setCurrentUser);

const handleUserUpdate = `
function handleUserUpdate(uuid) {
    location.reload();
}`;

const fullscreen = `
function fullscreen() {
    window.location.href = '/uff/fullscreen';
}`;

const handleKey = `
async function handleKey(k) {
    if (k == 'Escape') {


        const sepe = await findSepe();

        console.log("Turning effects off before quitting page.")
        await playLightEffect(sepe, "stop", [0,0,0]);
        await playScentEffect(sepe, "start", 0);

        window.location.href = '/uff';
    }
}`;

const script = `
let sepe = null

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

async function playScentEffect(sepe, action, intensity) {
  const body = {
    effectType: "ScentType",
    action: action,
    properties: [{ name: "intensity", value: intensity }],
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

async function execute() {

  await findSepe();
  if (!sepe) {
    console.error("No SEPE found, exiting.");
    return;
  }

  console.log("Scheduling light effects...");
  // Schedule light effects
  /*
    00:00 azul água
    00:09 rosa/roxo
    00:17 azul água
    00:28 azul escuro
    00:36 laranja
    00:45 branco azulado
    00:52 verde amarelado
    00:58 branco azulado
    01:18 azul água
    01:36 verde
    01:45 branco azulado
  */

  if (sepe) {
    setTimeout(() => {
      playLightEffect(sepe, "start", [0, 0, 255]); // Blue light
      playScentEffect(sepe, "start", 100); // start strong scent
    }, 0);

    setTimeout(() => {
      playLightEffect(sepe, "set", [255, 0, 255]); // Pink/Purple light
    }, 5000);

    setTimeout(() => {
      playLightEffect(sepe, "set", [0, 0, 255]); // Blue light
    }, 13000);

    setTimeout(() => {
      playLightEffect(sepe, "set", [0, 0, 139]); // Dark Blue light
    }, 25000);

    setTimeout(() => {
      playLightEffect(sepe, "set", [255, 165, 0]); // Orange light
    }, 33200);

    setTimeout(() => {
      playLightEffect(sepe, "set", [240, 248, 255]); // Light Blue/White light
    }, 42000);

    setTimeout(() => {
      playLightEffect(sepe, "set", [173, 255, 47]); // Greenish Yellow light
    }, 48000);

    setTimeout(() => {
      playLightEffect(sepe, "set", [240, 248, 255]); // Light Blue/White light
    }, 55000);

    setTimeout(() => {
      playLightEffect(sepe, "set", [0, 0, 255]); // Blue light
    }, 64000);

  } else {
    console.error("No SEPE found, cannot schedule light effects.");
  }
}

execute();

const video = document.getElementById("tvvideo");
video.addEventListener('ended', function(){

  execute();

  video.currentTime = 0;
  video.play();

})

`;

router.get("/", (req: Request, res: Response) => {
  let info_url = "/media/uff/carnavalInfo.png";
  let video_url = "/media/uff/aquario1080.mp4";

  res.render("bootstrap", {
    logo: DATA.serviceLogo,
    name: "UFF TV",
    details:
      '<img id="details" style="left: 4%; top: 40%; width: 96%; height: 23%;" src="/media/uff/details.png"/>',
    backMove: 'moveup="tvvideo"',
    usermove: 'movedown="tvvideo"',
    mainVideoMove: 'moveup="user" movedown="back"',
    info: info_url,
    mainVideoURL: video_url,
    script: handleUserUpdate + fullscreen,
  });
});

router.get("/fullscreen", (req: Request, res: Response) => {
  let video_url = "/media/uff/aquario1080.mp4";

  res.render("fullscreen", {
    mainVideoURL: video_url,
    script: handleUserUpdate + handleKey + script,
  });
});

export default router;
