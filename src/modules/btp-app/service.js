const core = require("../../core");

const DEFAULT_AVATAR_SVG =
  '<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">' +
  '<rect width="100" height="100" rx="30" fill="#4d7c5b"/>' +
  '<circle cx="50" cy="40" r="14" fill="none" stroke="#ffffff" stroke-width="5"/>' +
  '<path d="M 14 90 a 36 36 0 0 1 72 0" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>' +
  "</svg>";

function avatarHtml(avatar) {
  if (!avatar) return DEFAULT_AVATAR_SVG;
  if (typeof avatar === "string" && avatar.startsWith("<svg")) return avatar;
  return DEFAULT_AVATAR_SVG;
}

function profile() {
  var usr = core.getUserData(core.getCurrentUser());
  var html = `<span>${usr.name || ""}</span>${avatarHtml(usr.avatar)}`;
  return html;
}

function openBootstrapApp(mode) {
  if (mode != "info") {
    let bam = core.getCurrentService().bam;
    if (bam.initialMediaURLs) {
      core.setVideoURL(bam.initialMediaURLs[0]);
    }
  }
  core.setVideoSize("12%", "35%", "60%", "60%");
}

function bootstrapAppData() {
  let bam = core.getCurrentService().bam;

  return {
    appName: bam.appName,
    appIcon: bam.appIcon,
    appDescription: bam.appDescription || "",
    backgroundColor: bam.backgroundColor,
    foregroundColor: bam.foregroundColor,
  };
}

function esgData() {
  let esg = {};
  try {
    let esg = core.getServiceSLS().esg;

    return {
      validFrom: esg.Service.validFrom,
      validTo: esg.Service.validTo,
      contentName: esg.Service.Name.text,
      contentDescription: esg.Service.Description.text,
      genreColor: esg.Service.Genre.color,
      genreTerm: esg.Service.Genre.term,
      contentAdvisoryRatings: `media/rating/${esg.Service.ContentAdvisoryRatings}.png`,
    };
  } catch (error) {
    return {
      validFrom: "",
      validTo: "",
      contentName: "",
      contentDescription: "",
      genreColor: "",
      genreTerm: "",
      contentAdvisoryRatings: "",
    };
  }
}

function closeBootstrapApp(gui) {
  core.setDisplayGui(gui);
  core.setVideoURL();
  core.setVideoSize();
  core.unsetCurrentService();
}

function fullscreen() {
  core.setDisplayGui("");
  // Imagem estatica e so preview da tela de bootstrap: sai antes do fullscreen,
  // ao contrario do feed ao vivo, que continua rodando atras da app.
  const initial = core.getCurrentService()?.bam?.initialMediaURLs?.[0];
  if (initial && core.isStillImageURL(initial)) {
    core.setVideoURL();
  }
  core.setVideoSize();
  try {
    startApp(core.getServiceSLS().bald);
  } catch (error) {
    core.setBALDHandler(startApp);
  }
}

function startApp(bald) {
  bald.forEach((entryPackage) => {
    if (!entryPackage.controlCode || entryPackage.controlCode == "AUTOSTART") {
      // serviceId from the selected service (BALD entries carry none); only the
      // renderer differs between app types.
      const serviceId = core.getCurrentServiceId();
      const appId = entryPackage.appId;
      const packageUrl = entryPackage.bcastEntryPackageUrl || "";
      const entryPoint = entryPackage.bcastEntryPointUrl || "";
      if (entryPackage.appType == "TV30-Ginga-HTML5") {
        core.setDisplayGraphics(serviceId, appId, packageUrl, entryPoint);
      } else if (entryPackage.appType == "TV30-Ginga-NCL") {
        core.startNclApp(serviceId, appId, packageUrl, entryPoint);
      }
    }
  });
}

module.exports = {
  profile,
  openBootstrapApp,
  bootstrapAppData,
  esgData,
  closeBootstrapApp,
  fullscreen,
};
