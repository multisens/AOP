import NclApp, { nclContext } from './ncl-app';

let app_path = '/Users/joel/Coding/GingaDistrib/carnaval';
let doc:nclContext = {
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

export default (sid: number) => {
    return new NclApp('100', String(sid), app_path, doc);
}