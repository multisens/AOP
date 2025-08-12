import NclApp, { nclContext } from './ncl-app';

export let app_path = '/Users/joel/Coding/GingaDistrib/carnaval';
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
            src: 'granderio360.mp4'
        }
    ]
};