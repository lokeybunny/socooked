import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CURATED_ACCOUNTS = [
  "impenny2x","racer_dot_fun","andyayrey","cryptosis9_okx","tesla_optimus","deltaone","humansand",
  "aster_dex","lilalienz4ever","richardheartwin","j_mcgraph","govpressoffice","pokerbattle_ai",
  "liangwenfeng","predictionindex","remarks","ghostofrichy","weixin_wechat","hexianghu","polymarket",
  "cloakddev","secgov","snoopdogg","hsakatrades","joerogan","star_okx","im_roy_lee","binanceafrique",
  "colossal","prguitarman","ishowspeedsui","mrserikakirk","kantaro0925","bnbeesbsc","oraclebnbio",
  "washghost1","d3t3","latentspacepod","popmartglobal","ibcgroupio","pigeon_trade","pauliepunt",
  "ohyishi","publicfundapp","doganuraldesign","binanceus","0xinfra","realtrumpcoins1","ellazhang516",
  "xdevnotes","time","cincinnatizoo","fxnction","kettlebelldan","zooko","jack","knowyourmeme",
  "shopify","gopublicbot","uniswap","arjunsethi","dmdotfun","ac00lxyz","daosdotfun","_goldpanther",
  "jessetrowe","bonk_inu","lookonchain","asterina_app","kingjames","fiverr","stclairashley",
  "luminariessol","bwenews","colosseum","ft","hasantoxr","dhof","iamkadense","bbc","sundarpichai",
  "eth_cedric","drafteddotfun","coinbasemarkets","trondao","forbes","alanzeekk","cut4","antmiddleton",
  "nvidia","afpost","doge","crufro","matt_furie","interior","sonnet_4_5_","vp","betmoardotfun",
  "iliketeslas","jason_chen998","burgerkinguk","cryptunez","mashable","testingacc1234",
  "asteropus_trade","daltonc","atmdotday","best_post_ever","alx","morningbrew","giganaki",
  "warrenbuffett","jup_studio","durov2025","notch","jiankui_he","proofofnathan","meteoraag",
  "strategy","yoxics","peacefuldecay","bennyjohnson","boldleonidas","ashfromjelly","labsdotgoogle",
  "davemcnamee3000","wendotdev","repmtg","wublockchain12","bloomtradingbot","openai","rapidresponse47",
  "bagsclaimbot","bnbchain","harrypauldavies","benbybit","jesuschrist","tomwarren","googlejapan",
  "rosscohen","chatgptapp","disney","techcrunch","daily_mailus","charliekirk11","erictrump",
  "twizzygen","dylan522p","finnbags","frankdegods","dragontaillucky","memphiszoo","somos_axolotl",
  "googlelabs","shanghaidaily","atxp_ai","elder_dt","aldanor","maverickdarby","nikitabier",
  "esravil","theinformation","davidsacks","heyibinance","potus","chognft","polyshotio","pumpfun",
  "apro_oracle","jaileddotfun","oldrowofficial","pete_rizzo_","tartarialives","0xvaylin",
  "raydiumeco","verafyfoundtn","zssbecker","clarissa_krypto","lazymau","muststopmurad","maxkeiser",
  "banks","sama","bricsinfo","pontifex","watcherchase","tiagosada","rajgokal","ctafun","dykov_ilya",
  "dhsgov","iohk_charles","ilysalt","loncherbnb","kosgoood","cobie","heavendex","fightwithmemes",
  "doggypoo","alightinastorm","youranoncentral","jay_azhang","fourdotmemezh","jasonyanowitz",
  "yugalabs","chooserich","yennii56","0xit4i","mellometrics","thebabylonbee","bensig","andrewshaman",
  "all","thedemocrats","paoloardoino","jesus","solana_zh","firstsquawk","trump","lebinancefr",
  "huffpost","az_intel_","tetsuoai","garymarcus","namaste","soraofficialapp","muskonomy",
  "realdonaldtrump","teslaconomics","shrek","litecoin","oregonzoo","people","coindesk",
  "moonshotdotcc","realalexjones","lucanetz","0x3van","bonegpt","winrar_rarlab","techdevnotes",
  "btibor91","bangers","thegregyang","ownthedoge","0xproject","wickdottrade","taylorswift13",
  "shockedjs","sbf_ftx","nvidiarobotics","luminexio","leadingreport","newswire_us","unofficial_exe",
  "ledgerstatus","mavensbot","pareen","delta","newsweek","aggrnews","grimezsz","liminal_bardo",
  "diemarchive","thewhitewhalev2","collector_crypt","ga__ke","kris7146","iam_smx","xbusiness",
  "whaleinsider","_shadow36","0xkyon","senlummis","printr","lessin","cookerflips","donaldjtrumpjr",
  "sloane0x","bnbchainzh","yoheinakajima","lefthanddraft","json1444","ifindretards","mdudas",
  "grayscale","twitch","adakir4","echinanews","houstonzoo","cluely","something","minions","lofigirl",
  "jdmahama","pmarca","wifgamecoin","launchonbnb","0xdylan_","hey_zilla","calgaryzoo",
  "binanceangels","duolingo","communistkelly","martinshkreli","timsweeneyepic","four_form_",
  "openaidevs","faststocknewss","dior100x","geminiapp","deitaone","foxnews","alexmasmej","mrbeast",
  "nima_owji","jupalliance","chloeclem1","polyfutures","pledgepad","microstrategy","theroaringkitty",
  "sarahhh_sol","chatgpt21","askpolymarket","binancearg","boredelonmusk","molandak","cnnnews18",
  "github","jellyvideochats","launchonsoar","ivankatrump","jdong_3","gachadrop_io","oneshotmeme",
  "bybit_official","powerprtcl","goodalexander","natgeoanimals","0x_eunice","vgrichina",
  "dust_astherus","iamjasonlevin","matthieulc","awscloud","naddotfun","pasternak","rockstargames",
  "theonlynom","ethanniser","repligate","vibhu","soljakey","sandiegozoo","davidsacks47",
  "upward_earth","nickducoff","finalbossjack","revolut20","bublpay","gwr","achichuchu",
  "eugenedelgaudio","chibawan_info","worldlibertyfi","gamestop","zguz","operagxofficial","sterlexbot",
  "meekmill","kabosumama","cirklefnd","instagram","cryptomanran","solpaycash","ryoshiresearch",
  "coinmarketcap","google","michelleshieh","andrewchen","a16z","bitcoinmagazine","trustwallet",
  "picoreteam","claudeai","believeapp","seidlfabio","tyga","chrisdotsol","pinatadotfun","gajesh",
  "repnancymace","joebiden","dannycoleee","smcx22","sucateirocripto","playherbone","act","akrasiaai",
  "v","reptimmons","hank","coinbasewallet","degenping","caizer0x","fantoumi","binance_nzl","d_gilz",
  "naval","ryancarson","disneyparks","capdotbet","branche_sc","treenewsfeed","rishab_hegde",
  "kamalaharris","whybuydotfun","konstructivizm","gmonadofficial","lexaprotrader","pumpfunnewsfeed",
  "counterstrike","rxbixyz","m","evelegalai","binancedesi","arashbidgoli","twaniimals","4o4capital",
  "fearedbuck","russia","bonkdao","amazon","amandabinance","beachboyrobot","kashdhanda","xai",
  "boxabl","poe_real69","sheldricktrust","usat_io","deepneuron","bonkfun","coolcoffeedan",
  "mcdonalds","penguitt","brian_armstrong","nprussell","binancepk","okpasquale","binancebrasil",
  "diddy","torproject","radiantsdao","wordsporn","nounsdotfun","garrytan","davidvujanic",
  "dafuqboom_legit","xbtpika","labtrade_","polydata_cc","pancakeswap","realrossu","julienajdenbaum",
  "aihegemonymemes","orca_so","intern","rus","jupdao","devfunbuild","bnbcaptain","livinoffwater",
  "marketwatch","bull_bnb","stuubags","9gagceo","clipstake_x","grokipedia","dum_ilustrador",
  "solanapoet","rainmaker1973","peta","rongplace","stableronaldo","base","bagsapp","moonpay",
  "xhnews","dereknee","sherryyanjiang","shirleyxbt","amuse","tradefortendies","durov","reddit_lies",
  "yzy_mny","anothercohen","traderpow","gop","jakegagain","docdaniel","anomaly_fun","dogeofficialceo",
  "mckaywrigley","0xnadsa","wired","mustafasuleyman","bitcoinnewscom","john_j_brown","nyse",
  "jup_dao","vibecodeapp","10piecedawg","streamdotquest","grailindex","usdc","coinbase","cryptocom",
  "financialcmte","fifaworldcup","cyb3rgam3r420","trumpwarroom","binancevip","ampcode","dingalingts",
  "trobinsonnewera","tracking_doge","tesla","bjoernbonk","freelancer","umin_ai","dextero","mabot",
  "galianotiramani","timdraper","ytjiaff","abklabs","xmoney","0xvikrew","lauraloomer","jpeggler",
  "trendexgg","binancepoland","ericlarch","cryptosmerkis","ghoshal","bitcoin","oremdps","ax_pey",
  "pumppumpkinio","illusionoflife","deepseek_ai","yzilabs","wublockchain","stockmktnewz",
  "adriandittmann","firstdomain","unrevealedxyz","gettrumpmemes","va3ko","alterego_io","karim_rc",
  "believefndn","repnickbegich","emollick","theeconomist","vohvohh","four_meme_cs","planetofmemes",
  "espicodes","ramyobags","solporttom","vivekgramaswamy","nashvillezoo","darkfarms1","watcherguru",
  "tmz","jacobcanfield","xp","rookiexbt","ogprotocol","rexstjohn","stevenheidel","pokemon",
  "thegreataxios","pixar","bai_agent","dogwifcoin","kucoincom","ayunda_risu","zerohedge",
  "washtimes","ar15thed3mon","solana_devs","dividendsbot","tpusa","tetsuoarena","meme","cloud",
  "cristiano","bobbypoo","keonehd","notthreadguy","karol","pubity","moonit","cecilia_hsueh",
  "machibigbrother","walmart","mailonline","viakavish","testing","liminalcash","liping007",
  "port_dev","netflix","jupdesignlabs","avipat_","ordirums","binanceacademy","metaplex",
  "testingcatalog","coinbureau","cointelegraph","jonathanzliu","nudebloom","melaniatrump",
  "satoshiancap","grandfnf","plasma","normajtorres","housegop","benarmstrongsx","binancearabic",
  "kickstreaming","binanceitalian","groupie","nasahistory","bagsapi","vince_van_dough","uscpsc",
  "binancewallet","sugardotmoney","umbraprivacy","sisibinance","nuonomics","mst1287","beeple",
  "joshmandell6","billym2k","nytimes","himgajria","thorstenball","as400495","githubprojects",
  "binancezh","america","adam_tehc","uber","fbisaltlakecity","_tjrtrades","zachxbt","trumpdailyposts",
  "peterschiff","moonshotlisting","dailystar","royalfamily","jdvance","kevinweil","karpathy",
  "mwseibel","ligmadotsh","defiantls","teslaownerssv","hypex","chinadaily","tagcta","spacefish2025",
  "cometportfolio","euris_x","badrudyanichat","catturd2","_richardteng","weremeow","cryptoenact",
  "kevinafischer","runwayml","erictopol","buddiesforpaws","tendersalt","odailychina","crashiusclay69",
  "starlink","flapdotsh","energy","superteamae","roundtablespace","thedailybeast","based16z",
  "senadamschiff","barrontrump","unrevealedbnb","anthropicai","stoolpresidente","vangoghmuseum",
  "fifacom","gizmodo","netflixanime","roblox","drake","cobratate","binanceafrica","bonadfun",
  "ycombinator","dipwheeler","spidercrypto0x","shivon","klik_evm","ifunny","pioneerfnf","minecraft",
  "shayne_coplan","mirai_terminal","justinbieber","esatoshiclub","kylesamani","padreapp","lukebelmar",
  "0xmert_","arkham","zhongwenmeme","binanceforin","trendsdotfun","nasdaq","jeffbezos","0gantd",
  "zora","memics_25","nvidiaaidev","jameswynnreal","lucidxpl","binanceresearch","whale_alert",
  "0xsunnft","spyflips","chesterzoo","1x_tech","business","the_nof1","zagabond","rewn_ai",
  "leonard_aster","brc20niubi","opinionlabsxyz","nakamoto","fbidirectorkash","gr3gor14n","nanobanana",
  "dao_aisu","cupseyy","cain_bnb","capitalmarkets","baoskee","binance_intern","buntyverse",
  "janusfreight","microsoft","wozsol","9gag","flowe_ai","dalasreview","batzdu","newlistingsfeed",
  "sincara_bags","natgeo","binance_aus","nayibbukele","polyfactual","fdotinc","sebastienbubeck",
  "vibe_us_com","olivercingl","brezscales","jstelizabethcat","stevewilldoit","danesonance",
  "washingtonpost","ekailabsxyz","saint_whynne","dogeos","bemiux","kaiynne","garryfromfiverr",
  "iruletheworldmo","shl0ms","unusual_whales","southpark","polyboardnow","yhbryankimiq","fortnite",
  "solidintel_x","michaeljburry","solanagaming","autismcapital","kalshi","mayemusk",
  "polymarkettrade","nina_rong","rt_com","collinrugg","fuseenergy","abc","raydium","austin_federa",
  "cryptogle","independent","sunshinebinance","jessepollak","wallstreetbets","dimabuterin",
  "dailyloud","blknoiz06","aeyakovenko","fact","gatewaypundit","genflynn","neerajka","whceq47",
  "chrismurphyct","laraleatrump","fredhum","dogecoin","houseofdoge","goodworkmb","chriscoons",
  "_b___s","0xracist","solanaspaces","hkfp","jupiterexchange","ciniz","deepfates","jason",
  "chefgoyardi","traderwafe","zcserei","bonkbot_io","0xdaxak","dvorahfr","aelluswamy",
  "yokaicapital","senblumenthal","jupspanish","repkimkinghinds","timesnow","repbencline",
  "khaokheowzoo","boblatta","jupnigeria","coingecko","rudyanichat","buzzfeedjapan","mastronomers",
  "edinburghzoo","lonestarchica","rephalrogers","tesla_megapack","microsoftedge","jayobernolte",
  "notmrvinnychase","coinpedianews","bishara","truth_terminal","fbi","mewingbymikemew","patronisfl",
  "zachwarunek","senwarren","afkehaya","senrubengallego","chillguycto","dexerto","yahoofinance",
  "scavino47","repjeffcrank","repspartz","theunipcs","jason_shawhan","creepydotorg","ign",
  "thefigen_","telegram","marcellxmarcell","repstutzman","sciencenews","tesla_ai","_degenxbt",
  "repmarkalford","harshsaver","sammeh_","gainzy222","krakenfx","ericldaugh","cr0c0d1","lore100x",
  "stephterroir","yeti_dyor","t76861test","jakeschneider47","willmcgugan","zoomerfied",
  "stephenmiller47","shyonbonk","repjohnmcguire","reptiffany","usatoday","repbrandongill",
  "rephuizenga","venturetwins","hungrydegens","daily_express","senatorheinrich","0xcoinshift",
  "repharshbarger","boloudon","petesessions","deryatr_","balltzehk","repmccormick","repfedorchak",
  "kanyewest","avastudio_","levansolana","googleai","supergrok","nexta_tv","senmarkkelly",
  "shinya_elix","repgregsteube","nasa","reprichhudson","rasmr_eth","reuters","gl0w","cbsnews",
  "bbcnews","solana","phantom","abcnews","verge","theblock__","vitalikbuterin","elonmusk"
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const APIFY_TOKEN = Deno.env.get("APIFY_TOKEN");
  if (!APIFY_TOKEN) {
    return new Response(JSON.stringify({ error: "Missing APIFY_TOKEN" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Use twitterHandles to get latest 1 tweet per user
    // Small chunks to avoid Apify timeout — 25 handles finishes fast
    const hour = new Date().getUTCHours();
    const minute = Math.floor(new Date().getUTCMinutes() / 10); // 6 sub-rotations per hour
    const rotation = hour * 6 + minute; // 144 rotations per day
    const chunkSize = 25;
    const totalChunks = Math.ceil(CURATED_ACCOUNTS.length / chunkSize);
    const chunkIdx = rotation % totalChunks;
    const startIdx = chunkIdx * chunkSize;
    const selectedHandles = CURATED_ACCOUNTS.slice(startIdx, startIdx + chunkSize);

    const actorId = "xtdata~twitter-x-scraper";
    const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;

    const input = {
      twitterHandles: selectedHandles,
      maxItems: selectedHandles.length,
      sort: "Latest",
      tweetLanguage: "en",
      includeSearchTerms: false,
    };

    console.log(`X Feed: fetching latest tweet from ${selectedHandles.length} handles (chunk ${chunkIdx}/${totalChunks})`);

    const res = await fetch(runUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(180_000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Apify failed (${res.status}): ${err.slice(0, 300)}`);
    }

    const items: any[] = await res.json();

    // Normalize tweets - keep only 1 per user (latest)
    // Accept any item that has an id and text (don't filter on type — Apify may omit it)
    const byUser = new Map<string, any>();
    
    console.log(`X Feed: got ${items.length} raw items, sample types: ${items.slice(0, 5).map((i: any) => i.type || 'undefined').join(', ')}`);
    
    for (const tw of items) {
      // Accept tweets: must have id + (text or full_text), skip retweets
      if (!tw.id) continue;
      if (!tw.text && !tw.full_text) continue;
      if (tw.type && tw.type !== "tweet") continue;
      
      const user = (tw.author?.userName || tw.user?.screen_name || "").toLowerCase();
      if (!user) continue;
      
      const createdAt = tw.createdAt || tw.created_at || "";
      const existing = byUser.get(user);
      if (!existing || createdAt > (existing.createdAt || existing.created_at || "")) {
        byUser.set(user, tw);
      }
    }
    
    console.log(`X Feed: ${byUser.size} unique users after dedup`);

    const tweets = Array.from(byUser.values()).map((tw: any) => {
      let media_url = "";
      if (tw.extendedEntities?.media?.length) {
        const img = tw.extendedEntities.media.find((m: any) => m.type === "photo");
        if (img) media_url = img.media_url_https || img.media_url || "";
        if (!media_url) {
          const vid = tw.extendedEntities.media.find((m: any) => m.type === "video" || m.type === "animated_gif");
          if (vid) media_url = vid.media_url_https || vid.media_url || "";
        }
      }
      if (!media_url && tw.entities?.media?.length) {
        media_url = tw.entities.media[0].media_url_https || tw.entities.media[0].media_url || "";
      }

      return {
        id: tw.id,
        text: tw.text || tw.full_text || "",
        user: tw.author?.userName || tw.user?.screen_name || "",
        display_name: tw.author?.name || tw.author?.userName || "",
        avatar: tw.author?.profilePicture || "",
        verified: !!(tw.author?.isBlueVerified || tw.isBlueVerified),
        gold: tw.author?.verifiedType === "Business",
        likes: tw.likeCount || tw.favorite_count || 0,
        retweets: tw.retweetCount || tw.retweet_count || 0,
        replies: tw.replyCount || tw.reply_count || 0,
        views: tw.viewCount || 0,
        created_at: tw.createdAt || tw.created_at || "",
        media_url,
        url: tw.url || `https://x.com/${tw.author?.userName || "i"}/status/${tw.id}`,
      };
    })
    .sort((a: any, b: any) => (b.likes + b.retweets * 3) - (a.likes + a.retweets * 3));

    return new Response(JSON.stringify({
      tweets,
      total_scraped: items.length,
      accounts_covered: selectedHandles.length,
      chunk: chunkIdx,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("X Feed scraper error:", err);
    return new Response(JSON.stringify({ error: err.message || "Scrape failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
