wordpress  | [Wed Oct 07 21:51:54.733844 2026] [php:notice] [LigerBots Carpool] {"event":"launch_started"}
wordpress  | [Wed Oct 07 21:51:54.733862 2026] [php:notice] [LigerBots Carpool] {"event":"nonce_check_started"}
wordpress  | [Wed Oct 07 21:51:54.733885 2026] [php:notice] [LigerBots Carpool] {"event":"nonce_verified"}
wordpress  | [Wed Oct 07 21:51:54.733899 2026] [php:notice] [LigerBots Carpool] {"event":"configuration_validated"}
wordpress  | [Wed Oct 07 21:51:54.733920 2026] [php:notice] [LigerBots Carpool] {"event":"profile_validated","profile_fields":["uid","first_name","last_name","email"]}
wordpress  | [Wed Oct 07 21:51:54.735321 2026] [php:notice] [LigerBots Carpool] {"event":"provisioning_token_created"}
wordpress  | [Wed Oct 07 21:51:54.735336 2026] [php:notice] [LigerBots Carpool] {"event":"provisioning_request_started"}

carpool    | {
  "event":"user_provisioned",
  "request_id":"34f21a9d-6bcd-4569-9c94-a9cf89511767",
  "source_system":"wordpress",
  "source_uid":"2",
  "first_name":"Jack",
  "last_name":"User",
  "email":"raisch+juser@gmail.com",
  "telephone":null
  }
carpool    | {
  "event":"http_request",
  "request_id":"34f21a9d-6bcd-4569-9c94-a9cf89511767",
  "method":"POST",
  "path":"/api/integration/wordpress/provision",
  "status":200,
  "duration_ms":0
  }

wordpress  | [Wed Oct 07 21:51:54.736913 2026] [php:notice] [LigerBots Carpool] {"event":"provisioning_response_validated"}
wordpress  | [Wed Oct 07 21:51:54.736929 2026] [php:notice] [LigerBots Carpool] {"event":"launch_url_created"}
wordpress  | [Wed Oct 07 21:51:54.736932 2026] [php:notice] [LigerBots Carpool] {"event":"launch_redirect_ready"}
wordpress  | [Wed Oct 07 21:51:54 +0000] "GET /wp-admin/admin-post.php?action=ligerbots_carpool_launch HTTP/1.1" 303 612 "-" "..."

carpool    | {
  "event":"http_request",
  "request_id":"8260c395-cc6f-465a-94f4-0031d275a0c5",
  "correlation_id":null,
  "method":"GET",
  "path":"/launch",
  "status":303,
  "duration_ms":0
  }
carpool    | {
  "event":"http_request",
  "request_id":"99c713b3-3196-4dcd-a7cb-e196bdf10646",
  "correlation_id":null,
  "method":"GET",
  "path":"/carpool",
  "status":200,
  "duration_ms":0
  }