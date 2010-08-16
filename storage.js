//Storage
var url = require('url'),
	  http = require('http');


var hosturl = 'http://localhost:2304802394829034823904/'
var msgs = {};
var token_secret = 'aksdljf2oiadsfjklj2;'
var globalacl = {
	write: true, //without this anything else wouldnt work
	write_acl: true,
	add_children: true,
	subscribe: true,
	read: true,
	change_text: true
};


/*
	Through any signed message, there is a signature
	the other party checks that the token is valid
*/
var host_secrets = {};


function getSecret(host_url, token, callback){
	var h = url.parse(host_url);
	var host = h.protocol+'//'+h.host;
	var cl = http.createClient(h.port || 80, h.hostname); //todo: default HTTPS
	var req = cl.request('GET','/auth/'+token);
	req.on('response', function(res){
		var data='';req.on('data', function(d){data+=d});
		req.on('end', function(){
			//store data as the signature used to check other things
			host_secrets[host] = data;
			callback()
		})
	})
	req.end();
}


var host_cache = {}; //todo: fix potential issue with batch requests removing recent sig from cache. race conditions.

function signedRequest(host_url, payload, callback){
	var h = url.parse(host_url);
	var host = h.protocol+'//'+h.host;
	var cl = http.createClient(h.port || 80, h.hostname);
	var host_token = crypto.createHash('sha1')
			.update(token_secret+'//'+host)
			.digest('base64');
	var sig = crypto.createHmac('sha1', host_token)
			.update(payload)
			.digest('base64');
	console.log('host', host_url, 'host token',host_token,'request signature',sig)
	host_cache[host] = sig;
	var req = cl.request('POST', h.pathname, {
		sig: sig,
		host: host_url //reference to self
	});
	req.write(payload);
	req.end();
	req.on('response', function(res){
		var data='';req.on('data', function(d){data+=d})
		res.on('end', function(){
			callback(data)
		})
	})
	
}

function checkSignature(host, sig, data, callback, fail){
	if(host in host_secrets){
		var hmac = crypto.createHmac('sha1', host_secrets[host])
			.update(data)
			.digest('base64');
		(hmac == sig)?callback():fail();
	}else{
		getSecret(host, sig, function(){
			checkSignature(host, sig, data, callback, fail); //spare a .apply
		})
	}
}



//crappy diff algorithm which handles simple replace cases
//returns range of change:        [  ] -> []
//example:
//> diff('the huge cute pink elephant ate children',
//       'the huge cute gray elephant ate children')
//[14, 18, "gray"]
function diff(a, b){
  var al = a.length, bl = b.length, s = -1, e = -1;
  while(s++ < al && a[s] == b[s]);
  while(e++ < al && a[al-e] == b[bl-e]);
  return [s,al-e+1,b.substring(s,bl-e+1)]
}


function getACL(host, msg){
	//Chain: HostSpecific > MessageDefault > GlobalServerDefault
	var can = {};
	for(var i in globalacl) can[i] = globalacl[i];
	for(var i in msg.acl.def) can[i] = msg.acl.def[i];
	for(var i in msg.acl[host]) can[i] = msg.acl[host][i];
	return can
}


function applyDelta(id, host, delta){
	if(!(id in msgs)){
		msgs[id] = {
			acl: {
				def: {}
			},
			id: id,
			v: 0,
			subscribers: [],
			children: [],
			text: ''
		}
	}
	
	var msg = msgs[id];
	
	if(delta.v != msg.v){
		//version mismatch. FAIL
		return false;
	}
	
	var can = getACL(host, msg);
	
	if(can.subscribe && delta.subscribe){
		msg.subscribers.push(host);
	}
	
	if(can.write){
		msg.time = +new Date;
		msg.v++; //increment version
	
		if(can.write_acl && delta.acl){
			for(var i in delta.acl){
				msg.acl[i] = msg.acl[i] || {};
				for(var k in delta.acl[i])
					msg.acl[i][k] = delta.acl[i][k];
			}
		}
		
		if(can.add_children && delta.add_children){
			//TODO: support Reordering
			msg.children = msg.children.concat(delta.add_children);
		}
		
		//A *very* basic totally not working real OT that will have
		//TONS OF COLLISIONS. DO NOT USE THIS IN ANYTHING OTHER THAN
		//A PROTOTYPE!
		if(can.change_text && delta.ot){
			for(var i = 0, l = delta.ot.length; i < l; i++){
				var r = delta.ot[i]; //[14, 18, "gray"]
				msg.text = msg.text.substr(0,r[0]) + r[2] + msg.text.substr(r[1]);
			}
		}
	}
}






console.log(msgs.test.text)

applyDelta('test', 'nothing', {
	ot: [
		[5,6,' shiny ']
	],
	add_children: ['googlepoop']
})

console.log(msgs.test)