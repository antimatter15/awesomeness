**Awesomeness** Version 4. _Flexible Real Time, Federated, HTTP-based Protocol._

__What will hopefully result__
This application specifies a generic message storage system, the way multiple federated servers communicate to each other, and a HTTP based system for communication to agents. Messages contain text content and three metadata objects, data, acl and private. Updates are propagated around the system in real time, and so are search queries. 

__Definitions__
A Federation server stores messages, passes them to other servers, authorizes Agents and obeys the commands sent by Agents. Agents are web-accessible servers that can represent users or "bots" which act on a message programatically.

__Client Design__
The protocol is designed to be flexible enough for many potential use cases. The only difference is how the agents treat the messages and what kinds of queries are sent.

I would love to create an end user application powered by this protocol. Something that works as a social network and a means of communication. Think Facebook and it's Mail system or Gmail+Buzz.

Each user has a profile, it's actually just a message. 

A federation server can run a query on messages by a certain user on that user's federation server (since every message accessed/modified by a user will be mirrored by the federation server). That list would be the activity list, and can be aggregated into a single stream. 

Each message contains an "author" metadata attribute. The author is specifically a URL pointing to the user's profile, which contains more information, such as an avatar and full name.

Append /requests to the user-URL will be the name of the Requests message, an public write-only message. Anyone can write the message they want the user to become part of. Once shown to the user, the user has an option to view the message and add it to their private inbox.

Messages include a private state, this private state is only accessible to the user and always kept within the boundaries of the user's federation server. It exists for all messages and contains information such as read/unread state.

Messages can embed other messages, leading to nested conversations.

A type of message called a "gadget" could exist, which would contain a metadata object called "url". The client would load that page in an iframe and make a postMessage based API available to the embedded page so it can edit it's own metadata.

__What happened to versions 1, 2 and 3?__ I killed them.

__Protocol Design Goals__
* It should be easily portable, and it should be possible to make one in PHP without .htaccess or mod_rewrite
* It should probably be REST-ish. Something that for some reason I didn't do for the last versions but I keep forgetting the reason, so I'll make the mistake again this time but hopefully this time the mistake will work.
* It should be HTTP-ONLY. Also, no long-polling, hanging-gets. Pub/Sub is only available to web-accessible domains. The purpose of a user agent proxy is to convert these actions into WebSockets, Hanging-Gets, XMPP, etc. (Rationale: It makes the protocol simpler, and allows fully functioning implementations to be written for Google App Engine and in PHP)
	
	
	
__Reference Implementation__
* Node.JS For the Win.
* MongoDB, because all we really need is a searchable persistent hash table. However, of time of writing, I'm not aware if it's possible to set a list of queries and have a callback trigger whenever a matching search is identified. However, since scalability isn't absolutely critical to this implementation, having a list of queries and running them every time an operation is sent can't be that bad.