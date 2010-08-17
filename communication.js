/*
	Through any signed message, there is a signature
	the other party checks that the token is valid
*/
var url = require('url'),
		crypto = require('crypto'),
	  http = require('http');
	
var host_secrets = {};
var token_secret = '';
var my_url = '' //remember no trailing slash
exports.my_url = '';

exports.set_url = function set_url(url){
	exports.my_url = my_url = url;
	
}

exports.set_secret = function set_secret(secret){
	token_secret = secret;
}


exports.auth = function auth(req, res){
	var host_token = crypto.createHash('sha1')
			.update(token_secret+'//'+req.headers.host)
			.digest('base64');
	if(req.headers.secret == host_token){
		res.writeHead(200);
		res.end('YAY')
	}else{
		res.writeHead(404); //do anohter server error
		res.end('FAIL')
	}
}

exports.check = function checkSecret(req, win, fail){
	var host = req.headers.host, secret = req.headers.secret;
	if(host in host_secrets){
  	;(secret == host_secrets[host])?win():fail();
	}else{
		doRequest(host+'/auth', {
			secret: secret,
			host: my_url
		}, null, function(data){
			if(data == 'YAY'){
				host_secrets[host] = secret;
				win()
			}else fail();
		})
	}
}
//assumes that TLS is being used to secure the means 
//of transfer. so the verification is quite extremely
//weak.
exports.signHeader = function signHeader(host_url, headers){
	var r = (headers||{});
	var h = url.parse(host_url);
	var host = h.protocol+'//'+h.host;
	r.secret = crypto.createHash('sha1')
			.update(token_secret+'//'+host)
			.digest('base64');
	r.host = my_url
	return r
}

exports.doRequest = function doRequest(host_url, head, payload, callback){
	var h = url.parse(host_url);
	var cl = http.createClient(h.port||80, h.hostname); 
	//TODO: change default to TLS port
	var req = cl.request(payload?'POST':'GET', h.pathname, head || {});
	payload && req.write(payload);
	req.end();
	req.on('response', function(res){
		var data = '';
		res.on('data', function(p){data += p});
		res.on('end', function(){callback(data, res)})
	})
}


exports.POST = function signedPOST(host_url, payload, callback){
	doRequest(host_url, signHeader(host_url), payload, callback)
}

exports.GET = function signedGET(host_url, callback){
	doRequest(host_url, signHeader(host_url), null, callback)	
}