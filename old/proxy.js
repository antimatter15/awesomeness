var http = require('http');
var url = require('url');
var crypto = require('crypto')
var secret = 'changeme'//Math.random().toString(36).substr(3);
var msgs = {}; //meh, doesnt persist


function parseOps(res, ops){
	res.writeHead(200, {'Content-Type': 'text/plain'});
	res.write(JSON.stringify(ops.map(function(op){
		//todo: live json encoding
		if(op.type == 'load'){
			var msg = msgs[op.id];
			return {
				id: msg.id,
				lastModified: msg.lastModified,
				text: msg.text
			}
		}else if(op.type == 'modify'){
			
		}
	})))
  res.end();
}

function hostSig(host){
	return crypto.createHash('sha1').update(host+secret).digest('hex')
}

var sigcache = {}

function signRequest(uri, data, callback){
	console.log('signing request',uri)
	var u = url.parse(uri);
	var cl = http.createClient(u.port||80, u.hostname);
	var host = u.protocol+'//'+u.host; //host name
	var msig = crypto.createHmac('sha1', hostSig(host)).update(data).digest('hex');
	sigcache[msig] = host;
	console.log('signature',msig)
	var req = cl.request('POST', '/', {
		sig: msig,
		host: 'http://localhost:8125'
	});
	req.write(data);
	req.end();
	console.log('sending')
	req.on('response', function(res){
		console.log('getting response')
		var all = '';
		res.on('data', function(c){
			all += c;
			console.log('heres some data')
		})
		res.on('end', function(){
			//yay done
			callback(all)
			console.log('doneh')
		})
	})
}

function loadMessage(id, callback){
	if(msgs[id]){
		callback(msgs[id])
	}else{
		var mid = url.parse(id);
		signRequest(mid.protocol+'//'+mid.host, JSON.stringify([
			{
				type: 'sub',
				id: mid.pathname.substr(1),
				url: 'http://localhost:8125/push' //reference to self
			},
			{
				type: 'load',
				id: mid.pathname.substr(1)
			}
		]), function(data){
			console.log('got the data',data)
			var json = JSON.parse(data);
			msgs[id] = json[1] //not enough data?
			callback(msgs[id]);
		})
	}
}





http.createServer(function (req, res) {
	if(req.url == '/push'){ //how does a server confirm it came from the right one?
		//update ping
		console.log('recieving push update')
		var chunks = '';
		//TODO: live JSON parser
		req.on('data', function(chunk){
			chunks += chunk;
		})
		req.on('end', function(){
			JSON.parse(chunks)
			console.log('push data', chunks)
		})
	}else if(req.url.substr(0,9) == '/get_key/'){
		console.log('get key thingy')
		if(sigcache[req.url.substr(9)]){
			console.log('sending key woot')
			res.writeHead(200,{})
			res.write(hostSig(sigcache[req.url.substr(9)]))
			delete sigcache[req.url.substr(9)];
		}
		res.end();
		//get key
	}else if(req.url.substr(0,5) == '/get/'){
		res.writeHead(200,{})
		loadMessage('http://localhost:8124/cheesecake', function(msg){
			console.log(JSON.stringify(msg))
			res.write(msg.text);
			res.end();
		})
	}else if(/^\/set/.test(req.url)){
			var u = url.parse(req.url, true);
			res.writeHead(200,{})
			res.write('woot setting message');
			var mid = url.parse('http://localhost:8124/cheesecake');
			console.log('url req',mid.protocol+'//'+mid.host)
			signRequest(mid.protocol+'//'+mid.host, JSON.stringify([
				{
					type: 'modify',
					id: mid.pathname.substr(1),
					text: 'cheezkake iz tasteh '+Math.random()*Math.PI
				}
			]), function(data){
				var json = JSON.parse(data);
				console.log(data)
				res.end();
			})
	}else if(req.method == 'POST'){
		var chunks = '';
		//TODO: live JSON parser
		req.on('data', function(chunk){
			chunks += chunk;
		})
		req.on('end', function(){
			parseOps(res, JSON.parse(chunks));
		})
	}else{
		res.writeHead(404, {});
		res.end('PHAYLE')
	}
}).listen(8125, "127.0.0.1");
console.log('Server running at http://127.0.0.1:8125/');