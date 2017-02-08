'use strict';

const Parser = require('./lib/parser');
const Interaction = require('./lib/interaction');
const Context = require('./lib/context');
const Navigation = require('./lib/navigation');

exports.init = function (scope, state, args, data, next) {

    // create visjs only config object
    state.config = {};
    state.visConfig = {
        nodes: {
            shape: 'dot',
            scaling: { min: 20,max: 30,
                label: { min: 14, max: 30, drawThreshold: 9, maxVisible: 20 }
            },
            font: {size: 14, face: 'Helvetica Neue, Helvetica, Arial'}
        },
        interaction: {
            hover: true,
            hoverConnectedEdges: false,
            selectConnectedEdges: true
        }
    };

    Object.keys(args).forEach((key) => {
        switch (key) {
            case "events":
            case "parse":
            case "view":
            case "buttons":
            case "colors":
                state.config[key] = args[key];
                return;
            case "nodes":
            case "edges":
                state.visConfig[key] = {};
                state.config[key] = {};
                Object.keys(args[key]).forEach((subKey) => {
                    switch (subKey) {
                        case "events":
                        case "types":
                        case "expand":
                        case "open":
                            state.config[key][subKey] = args[key][subKey];
                            return;
                    }
                    state.visConfig[key][subKey] = args[key][subKey];
                });
                return;
        }

        state.visConfig[key] = args[key];
    });

    if (!(state.config.view = document.querySelector(args.view))) {
        return next(new Error('Flow-visualizer: DOM target not found.'));
    }

    state.index = {
        nodes: {},
        edges: {}
    };

    state.nodes = new vis.DataSet([]);
    state.edges = new vis.DataSet([]); 

    state.network = new vis.Network(state.config.view, {
        nodes: state.nodes,
        edges: state.edges
    }, state.visConfig);

    Interaction.init(scope, state);
    Context.init(scope, state);

    next(null, data);
};

exports.parse = function (scope, state, args, data, next) {

    let triples;
    if (!(data instanceof Array) && args.key && data[args.key]) {
        triples = data[args.key];
        data.nodes = [];
        data.edges = [];
    } else {
        triples = data;
        data = {
            nodes: [],
            edges: []
        };
    }

    data.node = data.node || {id: ''};

    const pos = {x: 0, y: 0};
    if (data.node) {
        pos.x = data.node.x || 0;
        pos.y = data.node.y || 0;
        pos.l = state.network.getBoundingBox(data.node.id) || {top: 0, left: 0, bottom: 0, right: 0};
        pos.l = Math.sqrt(Math.pow(pos.l.top - pos.l.bottom, 2) + Math.pow(pos.l.right - pos.l.left, 2));
        pos.parent = data.node.parent ? state.network.getPositions(data.node.parent)[data.node.parent] : {x: 0, y: 0};
    }

    Parser(state.config, triples, data, pos, state.index);

    next(null, data);
};

exports.add = function (scope, state, args, data, next) {

    if (!args.nodes && !args.edges && !data.nodes && !data.edges) {
        return next(new Error('Flow-visualizer.add: No nodes or edges found.'));
    }

    data.nodes && state.nodes.add(data.nodes);
    data.edges && state.edges.add(data.edges);

    // emit data change event
    if (state.config.events.dataChange) {
        scope.flow(state.config.events.dataChange).write({
            nodes: state.nodes._data,
            edges: state.edges._data
        });
    }

    next(null, data);
};

exports.remove = function (scope, state, args, data, next) {

    let nodes = [];
    let edges = [];
    const index = state.index;
    const getChildren = (id) => {
        if (index.nodes[id]) {

            // remove edges
            index.nodes[id].o.forEach(edge => {
                edges.push(edge);
                index.edges[edge] = null;
            });

            // remove nodes
            index.nodes[id].children.forEach(_id => {
                if (index.nodes[_id] && (index.nodes[_id].i === 0 || --index.nodes[_id].i === 0)) {
                    getChildren(_id);
                    nodes.push(_id);
                    index.nodes[_id] = null;
                }
            });
        }
    };

    if (data.node && data.node.id) {
        getChildren(data.node.id);
        index.nodes[data.node.id].children = [];
        state.nodes.remove(nodes);
    }

    if (edges.length) {
        state.edges.remove(edges);
    }

    next(null, data);
};

exports.reset = function (scope, state, args, data, next) {

    state.network.setData({
        nodes: data.nodes || [],
        edges: data.edges || []
    });

    next(null, data);
};

exports.context = function (scope, state, args, data, next) {

    if (!data.node) {
        return next(new Error('Flow-visualizer.context: No node provided.'));
        //return next(null, data);
    }

    Context.toggle(state, data.node);

    next(null, data);
};

exports.getSelectedNode = function (scope, state, args, data, next) {

    let selectedNodes = state.network.getSelectedNodes();
    data.node = (selectedNodes && selectedNodes.length) ? selectedNodes[0] : null;

    next(null, data);
};

/* Export Navigation methods */
exports.navigateSelectedNode = Navigation.navigateSelectedNode;

/* Export Interaction methods */
exports.focus = Interaction.focus;
exports.expandCollapse = Interaction.expandCollapse;
exports.changeFocusZoom = Interaction.changeFocusZoom;
