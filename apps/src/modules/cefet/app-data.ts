import NclApp, { nclContext } from './ncl-app';

export let app_path = '/home/dell-g15-1/Documentos/SetExpo/GingaDistrib/carnaval';
export let doc:nclContext = {
    id: 'body',
    ports: [
        {
            id: 'init',
            component: 'bateria'
        }
    ],
    medias: [
        {
            id: 'bateria',
            type: 'application/x-ncl360',
            src: 'bateria.ncl360'
        }
    ]
};