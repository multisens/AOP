export { pairingMethods } from './service';
import express, { Router } from 'express';
import controller from './controller';
const router: Router = express.Router();


/*
    C.6.1.2 Client authorization
*/
router.get('/authorize', controller.GETAuthorize);


export default router;