import * as mqttClient from '../../mqtt-client';


export type nclArea = {
    id: string,
    begin?: number,
    end?: number,
    label?: string
}

export type nclProperty = {
    name: string,
    value?: string
}

export type nclMedia = {
    id: string,
    src?: string,
    type?: string,
    device?: string,
    areas?: nclArea[],
    props?: nclProperty[]
}

export type nclBind = {
    role: string,
    component: string,
    interface?: string
}

export type nclLink = {
    binds: nclBind[]
}

export type nclPort = {
    id: string,
    component: string,
    interface?: string
}

export type nclContext = {
    id: string,
    ports?: nclPort[],
    medias?: nclMedia[],
    ctxts?: nclContext[],
    links?: nclLink[]
}

type nodeData = {
    id: string,
    type: string,
    mimeType?: string,
    device?: string
}

type interfaceData = {
    id: string,
    type: string
}


export default class NclApp {
    id: string;
    service: string;
    private app_path: string;
    private doc: nclContext;
    
    private topic_prefix: string;
    private node_data: nodeData[];
    private parsed: boolean;
    private started: boolean;

    private subscriptions: [string, mqttClient.TopicHandler][];
    private publications: string[];
    private occurrences: Record<string, number> = {};


    constructor(id: string, service: string, path: string, doc: nclContext) {
        this.id = id;
        this.service = service;
        this.app_path = path;
        this.doc = doc;

        this.topic_prefix = mqttClient.parseTopic(mqttClient.TOPIC.app_prefix, { serviceId: this.service, appId: this.id });
        this.node_data = [];
        this.parsed = false;
        this.started = false;
        this.subscriptions = [];
        this.publications = [];

        // Publish the app path
        this.publish(`${this.topic_prefix}/path`, this.app_path as string, true);

        // Subscrive to connected devices
        this.subscribe(`${mqttClient.TOPIC.devices}/guarana`, this.getDevices.bind(this));
    }


    private publish(t: string, m: string, r: boolean): void {
        if (!this.publications.includes(t))
            this.publications.push(t);
        
        mqttClient.publish(t, m, r);
    }


    private subscribe(t: string, f: mqttClient.TopicHandler): void {
        this.subscriptions.push([t, f]);
        mqttClient.addTopicHandler(t, f);
    }


    public getDevices(m: string): void {
        if (this.parsed) {
            console.log('Trying to change document after parsing.');
            return;
        }

        let devs: string[] = [];
        if (m) {
            devs = JSON.parse(m);
        }

        // Associate the document nodes to devices, if is the case
        this.associateContexttoDevice(this.doc, devs);

        // Generate the node list
        this.node_data = [];
        this.generateContextData(this.doc, []);

        // Publish the app nodes
        this.publish(`${this.topic_prefix}/doc/nodes`, JSON.stringify(this.node_data), true);

        // Generate node topics
        this.generateContextTopics(this.doc, `${this.topic_prefix}/doc`);

        this.parsed = true;
        console.log(this.doc);
    }


    private duplicateNode(node: nclMedia, id_suffix: string): nclMedia {
        let newnode: nclMedia = {
            id: `${node.id}${id_suffix}`,
            type: node.type
        };
        if (node.src) newnode.src = node.src;
        if (node.device) newnode.device = node.device;
        if (node.areas) {
            newnode.areas = [];
            node.areas.forEach(a => {
                let na: nclArea = { id: `area.id${id_suffix}` };
                if (a.begin) na.begin = a.begin;
                if (a.end) na.end = a.end;
                if (a.label) na.label = a.label;
                newnode.areas?.push(na);
            });
        }
        if (node.props) {
            newnode.props = [];
            node.props.forEach(p => {
                let np: nclProperty = { name: p.name };
                if (p.value) np.value = p.value;
                newnode.props?.push(np);
            });
        }

        return newnode;
    }


    private associateMediatoDevice(node: nclMedia, handles: string[]): nclMedia[] {
        if (!node.type) {
            if (node.src?.endsWith('htm') || node.src?.endsWith('html'))
                node.type = 'text/html';
            else if (node.src?.endsWith('txt'))
                node.type = 'text/plain';
            else if (node.src?.endsWith('png'))
                node.type = 'image/png';
            else if (node.src?.endsWith('jpg') || node.src?.endsWith('jpeg'))
                node.type = 'image/jpeg';
            else if (node.src?.endsWith('ncl360'))
                node.type = 'application/x-ncl360';
            else
                node.type = 'application/x-ginga-settings';
        }

        if (node.type == 'application/x-ncl360' && handles.length > 0) {
            let i = 0;
            let nodes: nclMedia[] = [];

            handles.forEach(handle => {
                let nn: nclMedia = this.duplicateNode(node, `_RD${String(i).padStart(2, '0')}`);
                nn.device = handle;
                nodes.push(nn);
                i++;
            });

            return nodes;
        }

        return [node];
    }


    private associateContexttoDevice(ctx: nclContext, handles: string[]): void {
        let medias: nclMedia[] = [];
        let ports: nclPort[] = [];

        ctx.medias?.forEach(n => {
            let m = this.associateMediatoDevice(n, handles);
            medias = medias.concat(m);

            ctx.ports?.forEach(p => {
                if (p.component == n.id) {
                    m.forEach(x => {
                        ports.push({
                            id: p.id,
                            component: x.id
                        });
                    });
                }
            });
        });
        ctx.medias = medias;

        ctx.ctxts?.forEach(c => {
            this.associateContexttoDevice(c, handles);

            ctx.ports?.forEach(p => {
                if (p.component == c.id) {
                    ports.push(p);
                }
            });
        });
        ctx.ports = ports;
    }


    private generateMediaData(node: nclMedia, ids: string[]): void {
        let id = ids.concat([node.id]);
        
        let data: nodeData = {
            id: id.join('.'),
            type: 'media',
            mimeType: node.type
        };
        if (node.device) {
            data.device = node.device;
        }

        this.node_data.push(data);
    }


    private generateContextData(ctx: nclContext, ids: string[]): void {
        ctx.medias?.forEach(n => {
            this.generateMediaData(n, ids);
        });

        ctx.ctxts?.forEach(c => {
            let id = ids.concat([c.id]);

            this.node_data.push({
                id: id.join('.'),
                type: 'context'
            });
            this.generateContextData(c, id);
        });
    }


    public updateState(t: string, n: string, occ: number): number {
        let state = 'sleeping';
        if (n == 'starts' || n == 'resumes') {
            state = 'occurring';
        }
        else if (n == 'pauses') {
            state = 'paused';
        }

        this.publish(`${t}/state`, state, true);

        if(n == 'stops') {
            this.publish(`${t}/occurrences`, String(occ), true);
            return occ + 1;
        }
        else {
            return occ;
        }
    }


    private generateLink(t: string, cond_evt: string, cond_trn: string, act_evt: string, act_trn: string): void {
        this.subscribe(`${t}/${cond_evt}/eventNotification`, (m) => {
            if (m == cond_trn) {
                this.publish(`${t}/${act_evt}/actionNotification`, act_trn, false);
            }
        });
    }


    private generateStateMachine(t: string): void {
        this.publish(`${t}/state`, 'sleeping', true);
        this.publish(`${t}/occurrences`, '0', true);

        if (this.occurrences[t] === undefined) {
            this.occurrences[t] = 0;
        }
        this.subscribe(`${t}/eventNotification`, (m) => {
            this.occurrences[t] = this.updateState(t, m, this.occurrences[t]);
        });
    }


    private generateMediaTopics(node: nclMedia, prefix: string): void {
        prefix += `/${node.id}`;
        
        // event data
        this.generateStateMachine(`${prefix}/preparationEvent`);
        this.generateStateMachine(`${prefix}/presentationEvent`);

        // link between preparation and presentation
        this.generateLink(prefix, 'preparationEvent', 'stops', 'presentationEvent', 'start');

        // interfaces data
        let ifaces: interfaceData[] = [];
        node.areas?.forEach(a => {
            // Add interface to the list
            ifaces.push({
                id: a.id,
                type: 'area'
            });

            // Publish area topics
            this.generateStateMachine(`${prefix}/${a.id}/preparationEvent`);
            this.generateStateMachine(`${prefix}/${a.id}/presentationEvent`);
        });
        node.props?.forEach(p => {
            // Add interface to the list
            ifaces.push({
                id: p.name,
                type: 'property'
            });

            // Publish property value
            if (p.value)
                this.publish(`${prefix}/${p.name}/attributionEvent/value`, p.value, true);

            this.generateStateMachine(`${prefix}/${p.name}/attributionEvent`);
        });

        // Save the SRC as property
        if (node.src) {
            ifaces.push({
                id: 'src',
                type: 'property'
            });
            this.publish(`${prefix}/src/attributionEvent/value`, node.src, true);
            this.generateStateMachine(`${prefix}/src/attributionEvent`);
        }

        if (ifaces.length > 0) {
            this.publish(`${prefix}/interfaces`, JSON.stringify(ifaces), true);
        }
    }


    private generateContextTopics(ctx: nclContext, prefix: string): void {
        ctx.medias?.forEach(n => {
            this.generateMediaTopics(n, prefix);
        });

        ctx.ctxts?.forEach(c => {
            this.generateContextTopics(c, `${prefix}/${c.id}`);
            // TODO: generate topics for the context as a whole
        });
    }


    private prepareContext(ctx: nclContext, prefix: string): void {
        let ids: string[] = [];
        ctx.ports?.forEach(p => {
            ids.push(p.component);
        });

        ctx.medias?.forEach(m => {
            ids.forEach(id => {
                if (m.id.startsWith(id)) {
                    let t = prefix + `/${m.id}`;
                    this.publish(`${t}/preparationEvent/actionNotification`, 'start', false);
                }
            });
        });
    }


    public startApp() {
        if (this.started) return;
        if (!this.parsed) {
            console.error('Application is not parsed');
        }
        
        // Prepare all nodes in the app
        this.prepareContext(this.doc, `${this.topic_prefix}/doc`);
    }


    public stopApp() {
        this.doc.medias?.forEach(m => {
            let t = `${this.topic_prefix}/doc/${m.id}`;
            this.publish(`${t}/presentationEvent/actionNotification`, 'stop', false);
        });
    }
    

    public terminate(): void {
        this.subscriptions.forEach((sub) => {
            mqttClient.removeTopicHandler(sub[0], sub[1]);
        });
        this.publications.forEach((pub) => {
            mqttClient.publish(pub, '', true);
        });
        this.parsed = false;
        this.started = false;
    }
}