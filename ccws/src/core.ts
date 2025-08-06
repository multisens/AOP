import mqttClient, { TOPICS } from "./mqtt-client";
import { AppNode } from "./modules/remotedevice-manager/remote-device";
import { associateAppNodes } from "./modules/remotedevice-manager/manager";

type CoreData = {
  app: {
    sid: string;
    id: string;
    url: string;
    nodes: AppNode[];
  };
  services: {
    serviceId: number;
    serviceName: string;
    serviceIcon: string;
    initialMediaURL: string;
  }[];
  current: {
    serviceName: string;
    serviceId: number;
    serviceContextId: string;
    transportStreamId: string;
    originalNetworkId: string;
  };
};

const data: CoreData = {
  app: {
    sid: "",
    id: "",
    url: "",
    nodes: [],
  },
  services: [],
  current: {
    serviceName: "",
    serviceId: -1,
    serviceContextId: "c08b2c72-fd14-4095-adaf-2e5810850c57",
    transportStreamId: "c08b2c72-fd14-4095-adaf-2e5810850c57",
    originalNetworkId: "09e59a1d-e2e7-467e-85db-2fb5a572e2fc",
  },
};

function setAppId(appid: string): void {
  if (!appid) return;
  if (data.app.id == appid) return;

  if (data.app.id) {
    let t = mqttClient.parseTopic(TOPICS.app_path, {
      serviceId: data.app.sid,
      appId: data.app.id,
    });
    mqttClient.removeTopicHandler(t, setAppBaseURL);

    t = mqttClient.parseTopic(TOPICS.app_nodes, {
      serviceId: data.app.sid,
      appId: data.app.id,
    });
    mqttClient.removeTopicHandler(t, setAppNodes);
  }

  let t = mqttClient.parseTopic(TOPICS.app_path, {
    serviceId: data.app.sid,
    appId: appid,
  });
  mqttClient.addTopicHandler(t, setAppBaseURL);

  t = mqttClient.parseTopic(TOPICS.app_nodes, {
    serviceId: data.app.sid,
    appId: data.app.id,
  });
  mqttClient.addTopicHandler(t, setAppNodes);

  data.app.id = appid;
}

function setAppBaseURL(path: string): void {
  if (!path) return;

  data.app.url = path;
}

function setAppNodes(nodes: string) {
  if (!nodes) return;

  data.app.nodes = JSON.parse(nodes);
  associateAppNodes();
}

function currentService(sid: string): void {
  if (!sid) return;
  if (sid == data.app.sid) return;

  let t = mqttClient.parseTopic(TOPICS.current_app, {
    serviceId: data.app.sid,
  });
  mqttClient.removeTopicHandler(t, setAppId);

  if (data.app.id) {
    let t = mqttClient.parseTopic(TOPICS.app_path, {
      serviceId: data.app.sid,
      appId: data.app.id,
    });
    mqttClient.removeTopicHandler(t, setAppBaseURL);

    t = mqttClient.parseTopic(TOPICS.app_nodes, {
      serviceId: data.app.sid,
      appId: data.app.id,
    });
    mqttClient.removeTopicHandler(t, setAppNodes);
  }

  t = mqttClient.parseTopic(TOPICS.current_app, { serviceId: sid });
  mqttClient.addTopicHandler(t, setAppId);

  data.app.sid = sid;
  data.app.id = "";
  data.app.url = "";
  data.app.nodes = [];
}

mqttClient.addTopicHandler(TOPICS.current_service, currentService);

function loadServiceData(m: string): void {
  if (!m) return;

  data.services = JSON.parse(m);
}

mqttClient.addTopicHandler(TOPICS.services, loadServiceData);

export default data;
