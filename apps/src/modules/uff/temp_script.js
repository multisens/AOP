async function findSepe() {
  try {
    const response = await fetch(
      "http://localhost:44642/tv3/sensory-effect-renderers"
    );

    console.log("Response:", response);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (!data || !data.renderers || data.renderers.length === 0) {
      return null;
    }

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

  const response = fetch(
    "http://localhost:44642/tv3/sensory-effect-renderers/" + sepe.id,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
}

async function playScentEffect(sepe, action, intensity) {
  const body = {
    effectType: "ScentType",
    action: action,
    properties: [{ name: "intensity", value: intensity }],
  };

  const response = fetch(
    "http://localhost:44642/tv3/sensory-effect-renderers/" + sepe.id,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
}

async function execute() {

  const sepe = await findSepe();
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
      playLightEffect(sepe, "set", [0, 0, 255]); // Blue light
    }, 0);

    setTimeout(() => {
      playLightEffect(sepe, "set", [255, 0, 255]); // Pink/Purple light
      playScentEffect(sepe, "start", 50); // Light scent
    }, 9000);

    setTimeout(() => {
      playLightEffect(sepe, "set", [0, 0, 255]); // Blue light
    }, 17000);

    setTimeout(() => {
      playLightEffect(sepe, "set", [0, 0, 139]); // Dark Blue light
    }, 28000);

    setTimeout(() => {
      playLightEffect(sepe, "set", [255, 165, 0]); // Orange light
      playScentEffect(sepe, "stop", 50); // Stop light scent
    }, 36000);

    setTimeout(() => {
      playLightEffect(sepe, "set", [240, 248, 255]); // Light Blue/White light
      playScentEffect(sepe, "start", 100); // Strong scent
    }, 45000);

    setTimeout(() => {
      playLightEffect(sepe, "set", [173, 255, 47]); // Greenish Yellow light
    }, 52000);

    setTimeout(() => {
      playLightEffect(sepe, "set", [240, 248, 255]); // Light Blue/White light
    }, 58000);

    setTimeout(() => {
      playLightEffect(sepe, "set", [0, 0, 255]); // Blue light
      playScentEffect(sepe, "stop", 100); // Stop strong scent
    }, 78000);

    setTimeout(() => {
      playLightEffect(sepe, "set", [0, 128, 0]); // Green light
    }, 96000);

    setTimeout(() => {
      playLightEffect(sepe, "set", [240, 248, 255]); // Light Blue/White light
    }, 105000);

  } else {
    console.error("No SEPE found, cannot schedule light effects.");
  }
}

execute();
