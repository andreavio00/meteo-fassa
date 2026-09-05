// Cloudflare Worker — proxy per l'API Ecowitt (bypassa il CORS)

const DEVICE_ID = "UFM5enM2RThlV2hibUs0QXJGc3hGQT09";
const AUTHORIZE = "NGH5EC";

export default {
  async fetch(request) {
    // Risponde subito alle richieste "preflight" del browser
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const now = Math.floor(Date.now() / 1000);

    const body = new URLSearchParams({
      device_id: DEVICE_ID,
      is_list: "0",
      mode: "1",
      sdate: String(now - 3600),
      edate: String(now),
      page: "1",
      authorize: AUTHORIZE,
      sortList: "1|5|6",
      hideList: ""
    });

    try {
      const upstream = await fetch("https://www.ecowitt.net/index/get_data", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString()
      });

      const data = await upstream.text();

      return new Response(data, {
        status: upstream.status,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders()
        }
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ errcode: "-1", errmsg: String(err) }),
        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
