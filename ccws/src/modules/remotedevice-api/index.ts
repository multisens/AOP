import express, { Request, Response, Router } from "express";
import controller from "./controller";
const router: Router = express.Router();

/*
    C.6.15.2 Registering a remote device
*/
router.post("/", controller.POSTRemoteDevice);

/*
    C.6.15.3 Deregistering a remote device
*/
router.delete("/:handle", controller.DELETERemoteDevice);

/*
    C.6.15.5 Enabling communication with a remote device
        This API allows a local client application to get the remote devices currently
        registered with TV 3.0 WebServices in a given class and establish
        communication with those devices.
*/
router.get("/devices/:classId", controller.GETRemoteDevices);

export default router;
