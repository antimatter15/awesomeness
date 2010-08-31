//gadget code is stolen from microwave, which is stolen from splash

function submitDelta(id, diff){
	socket.send({
	  op: {
	    id: id,
	    v: msgs[id].v+1,
  		data: {
  		  state: diff
  		}
	  }
	})
}


function addGadget(){
	var nid = 'http://localhost:8124/g'+Math.random().toString(36).substr(2,3);
						//obviously, 3 characters provides nowhere near enough entropy
						//in a production environment
  var msg = document.createElement('gadget');
  msg.className = '_dyn';
  msg.setAttribute('name', nid);
  dynamic_renderer(msg);
  document.getSelection().getRangeAt(0).insertNode(msg);
}



function renderGadget(id){
	/*
		WARNING:
		these closures are probably prone to memory leaks. FIX IT.
	*/
	if(!(id in msgs)) loadMessage(id);
	
	var d = document.createElement('div');
	d.contentEditable = 'false';
	
	
	var hdr = document.createElement('div');
	hdr.className = 'header'
	
	
	hdr.innerText = id+' v'+msgs[id].v+' '+format_time(msgs[id].time);
	d.header = hdr;
	d.appendChild(hdr)
	
	
	d.id = id;


  var frame_id = 'frame_'+id;
  var url = 'http://wave-api.appspot.com/public/gadgets/areyouin/gadget.xml';
	var gadget_url = 'http://www.gmodules.com/gadgets/ifr?container=wave&view=default&debug=0&lang=en&country=ALL&nocache=0&wave=1&mid='+encodeURIComponent(frame_id)+'&parent='+encodeURIComponent(location.protocol+'//'+location.host+location.pathname)+'&url='+encodeURIComponent(url);


  create_gadget_frame(frame_id, gadget_url, d);
  console.log('creating '+frame_id+' for gadget '+url);


  
  d.update = function(){
	  hdr.innerText = id+' v'+msgs[id].v+' '+format_time(msgs[id].time);
	  gadgets.rpc.call('frame_'+id, "wave_gadget_state", null, msgs[id].data.state);
  }


	d.className = 'gadget'
	
	return d
}


function registerRpc(service, handler) {
  gadgets.rpc.register(service, function() {
    var service = this['s'];
    var gadgetId = this['f'];
    var args = this['a'];
    handler(service, gadgetId, args);
  });
}

var gadgetQueue = {};

function initGadgetSystem() {
  // Once a gadget has called us back, we can inject the state/participants.
  var REMOTE_RPC_RELAY_URL =
    "http://www.gmodules.com/gadgets/files/container/rpc_relay.html";

  
  registerRpc("wave_enable", function(service, gadgetId, args) {
    gadgets.rpc.setRelayUrl(gadgetId, REMOTE_RPC_RELAY_URL);
    extractGadgetState(gadgetId);
  });

  registerRpc("resize_iframe", function(service, gadgetId, args) {
    document.getElementById(gadgetId).height = args[0]
  });

  gadgets.rpc.registerDefault(function() {
    var eventType = this['s'];
    var eventObj = this['a'][0];
    var gadgetId = this['f'];
    console.log(this);
    
    if(eventType == 'wave_gadget_state'){
      console.log('updating state', eventObj);
      
      if(!gadgetQueue[gadgetId])gadgetQueue[gadgetId]={};
      
      
      for(var i in eventObj){
        gadgetQueue[gadgetId][i] = eventObj[i]; //apply the delta
      }
      //wave.blip.update_element(eventObj, gstates[gadgetId].blipId, current_wave, current_wavelet);
      //runQueue();
      
    }
    console.log(eventType,eventObj);
  });

  setInterval(function(){
    for(var gadgetId in gadgetQueue){
      var c = 0;for(var i in gadgetQueue[gadgetId]) c++;
      if(c > 0){
        submitDelta(gadgetId.substr(6), gadgetQueue[gadgetId]);
      }
      delete gadgetQueue[gadgetId];
    }    
  },100);

}


setTimeout(initGadgetSystem, 1000);

function create_gadget_frame(id, gadget_url, container){
    var frameDiv = document.createElement('div');
    frameDiv.innerHTML = '<iframe name="' + id + '" >';
    var frame = frameDiv.firstChild;
    frame.id = id;
    frame.width = '320px';
    frame.height = '250px';
    frame.frameBorder = 'yes';
    frame.scrolling = 'no';
    frame.marginHeight = 0;
    frame.marginWidth = 0;
    // Create in specified div, or if none, in main body
    container = container || document.body;
    container.appendChild(frame);
    frame.src = gadget_url;
    return frame; 
}

function extractGadgetState(gadgetId) {	
	var DEFAULT_GADGET_MODE = {'${playback}': '0', '${edit}': '1'};

  console.log(gadgetId)
  var participants = {
		myId: 'testing',
		authorId: 'testing',
		participants: {
		  'testing': {
		    id: 'testing',
		    displayName: 'testing user',
		    thumbnailUrl: 'https://wave.google.com/a/google.com/static/images/unknown.jpg'
		  }
		}
	};
  // TODO: Enable gadget updates.
  gadgets.rpc.call(gadgetId, "wave_gadget_mode", null, DEFAULT_GADGET_MODE);
  gadgets.rpc.call(gadgetId, "wave_participants", null, participants);
  gadgets.rpc.call(gadgetId, "wave_gadget_state", null, msgs[gadgetId.substr(6)].data.state);
  // TODO: Deliver the real private state to the gadgets.
  gadgets.rpc.call(gadgetId, "wave_private_gadget_state", null, {});

}


