import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as express from 'express';
import * as expressSession from 'express-session';
import * as mongoose from 'mongoose';
import * as MongoStore from 'connect-mongo';
const _MongoStore: MongoStore.MongoStoreFactory = MongoStore(expressSession);
import * as compression from 'compression';
import * as bodyParser from 'body-parser';
import * as cookieParser from 'cookie-parser';
import * as csrf from 'csurf';
const vhost: any = require('vhost');
const sticky: any = require('sticky-listen');

import config from './config';

import api from './api/server';
import resources from './resources-server';
import router from './router';
import streaming from './api/streaming';

// Global options
const sessionExpires: number = 1000 * 60 * 60 * 24 * 365;
const subdomainOptions = {
	base: config.publicConfig.host
};

// Init DB connection
const db: mongoose.Connection = mongoose.createConnection(config.mongo.uri, config.mongo.options);

const session: any = {
	name: config.sessionKey,
	secret: config.sessionSecret,
	resave: false,
	saveUninitialized: false,
	cookie: {
		path: '/',
		domain: `.${config.publicConfig.host}`,
		httpOnly: true,
		secure: config.https.enable,
		expires: new Date(Date.now() + sessionExpires),
		maxAge: sessionExpires
	},
	store: new _MongoStore({
		mongooseConnection: db
	})
};

// Init server
const app: express.Express = express();
app.disable('x-powered-by');
app.locals.compileDebug = false;
app.locals.cache = true;
// app.locals.pretty = '    ';
app.set('view engine', 'pug');

// Init API server
app.use(vhost(config.publicConfig.webApiHost, api(session)));

// Init static resources server
app.use(vhost(config.publicConfig.resourcesHost, resources()));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser(config.cookiePass));
app.use(compression());

// CORS
app.use((req, res, next) => {
	if (req.headers['origin'] === config.publicConfig.registerUrl) {
		res.header('Access-Control-Allow-Origin', `${config.publicConfig.registerUrl}`)
	} else {
		res.header('Access-Control-Allow-Origin', `${config.publicConfig.url}`)
	}
	res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
	res.header('Access-Control-Allow-Headers', 'Content-Type, csrf-token');
	res.header('Access-Control-Allow-Credentials', 'true');

	res.vary('Origin')

	// intercept OPTIONS method
	if (req.method === 'OPTIONS') {
		res.sendStatus(200);
	} else {
		next();
	}
});

// Session settings
app.use(expressSession(session));

// CSRF
app.use(csrf({
	cookie: false
}));
app.use((req, res, next) => {
	res.locals.csrftoken = req.csrfToken();
	next();
});

app.use(require('subdomain')(subdomainOptions));

// HSTS
if (config.https.enable) {
	app.use((req, res, next) => {
		res.header('Strict-Transport-Security', 'max-age=15768000; includeSubDomains; preload');
		next();
	});
}

// Statics
app.get('/favicon.ico', (req, res) => {
	res.sendFile(path.resolve(`${__dirname}/favicon.ico`));
});

// Return publicconfig
app.get('/publicconfig.json', (req, res) => {
	res.send(config.publicConfig);
});

router(app);

let server: http.Server | https.Server;

if (config.https.enable) {
	server = https.createServer({
		key: fs.readFileSync(config.https.keyPath),
		cert: fs.readFileSync(config.https.certPath)
	}, app);

	http.createServer((req, res) => {
		res.writeHead(301, {
			Location: config.publicConfig.url + req.url
		});
		res.end();
	}).listen(config.port.http);
} else {
	server = http.createServer(app);
}

// go stream
streaming(server);

sticky.listen(server);
process.send({cmd: 'ready'});
