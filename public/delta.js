
io.setPath('/Socket.IO-node/example/client/');

var socket = new io.Socket(null, {port: 8125}); //todo: get the port from location
socket.connect();
socket.on('message', function(obj){
  applyDelta(obj.id, obj)
});

var msgs = {};
function applyDelta(id, delta){
	if(!(id in msgs)){
			loadMessage(id)
	}
		
	console.log('got delta',delta)
	
	var msg = msgs[id];
	
	if(delta.v != msg.v + 1){
		//version mismatch. FAIL
		console.log('version mismatch Expected:'+(msg.v+1)+' Got:'+delta.v)
		throw 'version mismatch Expected:'+(msg.v+1)+' Got:'+delta.v
	}
	
	if(delta.acl){
		for(var i in delta.acl){
			msg.acl[i] = msg.acl[i] || {};
			for(var k in delta.acl[i])
				msg.acl[i][k] = delta.acl[i][k];
		}
	}
	
	if(delta.data){
		for(var i in delta.data){
			msg.data[i] = msg.data[i] || {};
			for(var k in delta.data[i])
				msg.data[i][k] = delta.data[i][k];
		}
	}
	
	if(delta.add_children){
		//TODO: support Reordering
		msg.children = msg.children.concat(delta.add_children);
		for(var i = 0; i < delta.add_children.length; i++){
			var ci = delta.add_children[i]
			loadMessage(ci);
			document.getElementById(id).threadel.appendChild(renderMsg(ci));
		}
	}
	
	//A *very* basic totally not working real OT that will have
	//TONS OF COLLISIONS. DO NOT USE THIS IN ANYTHING OTHER THAN
	//A PROTOTYPE!
	if(delta.ot){
		for(var i = 0, l = delta.ot.length; i < l; i++){
			var r = delta.ot[i]; //[14, 18, "gray"]
			msg.text = msg.text.substr(0,r[0]) + r[2] + msg.text.substr(r[1]);
		}
	}
	
	msg.time = delta.time;
	msg.v = delta.v; //increment version
	//console.log(msg.text)
	
	var ed = document.getElementById(id);
	ed.update()

}

function format_time(ts){
	var t = new Date;
	t.setTime(ts);
	if(t.toString().indexOf('Invalid') == 0) return 'Never';
	return t.getMonth() + '/' + t.getDate() + ' ' + t.getHours() + ':' + t.getMinutes() + ':' + t.getSeconds();
}

function update(id, diff){
	socket.send({
	  op: {
	    id: id,
	    v: msgs[id].v+1,
  		ot: [diff]
	  }
	})
}




function listen(url){
	socket.send({
	  add: url
  })
}



function loadMessage(id){
	//todo: make async
	var xhr = new XMLHttpRequest();
	xhr.open('GET','/loadmsg?url='+encodeURIComponent(id), false);
	xhr.send(null);
	var j = JSON.parse(xhr.responseText);
	//j.history = [];
	msgs[id] = j;
	listen(id);
}



function dynamic_renderer(el){
	var tn = el.tagName.toLowerCase();
	var en = el.getAttribute('name')
	if(tn == 'message'){
		el.appendChild(renderMsg(en))
	}else if(tn == 'gadget'){
	  el.appendChild(renderGadget(en));
		//el.innerHTML = 'YAY POOP'
	}
}


function render(id){
  var parent = document.getElementById('main');
	parent.innerHTML = '';
	if(!(id in msgs)) loadMessage(id);
	var msg = msgs[id];
	var el = renderMsg(id);
	parent.appendChild(el)
}

