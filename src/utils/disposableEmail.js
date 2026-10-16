/**
 * Disposable / temporary email detection.
 *
 * The domain list is NOT hardcoded here. At startup the backend pulls a
 * maintained public blocklist and caches it in memory, refreshing daily:
 *
 *   https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/master/disposable_email_blocklist.conf
 *   (~10,000 domains, community-maintained and kept current)
 *
 * A small built-in fallback keeps things working if that fetch ever fails
 * (offline dev, blocked egress). Override the source with DISPOSABLE_EMAIL_LIST_URL.
 */

const LIST_URL =
  process.env.DISPOSABLE_EMAIL_LIST_URL ||
  'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/master/disposable_email_blocklist.conf';

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // refresh once a day
const FETCH_TIMEOUT_MS = 8000;

export const DISPOSABLE_EMAIL_MESSAGE =
  'Temporary or disposable email addresses are not allowed. Please use a permanent email address.';

// Offline fallback — used only until the maintained list loads, or if it cannot.
const FALLBACK_DOMAINS = [
  'mailinator.com', 'mailinator.net', 'mailinator.org', 'mailinator2.com', 'notmailinator.com',
  'reallymymail.com', 'sogetthis.com', 'suremail.info', 'thisisnotmyrealemail.com',
  '10minutemail.com', '10minutemail.net', '10minutemail.org', '10minutemail.co.za', '10minutemail.de',
  '10minutemail.ru', '10minutemail.co.uk', '10minutemail.us', '20minutemail.com', '20minutemail.it',
  '30minutemail.com', 'minuteemail.com', 'minutemail.com', '10mail.org', '10mail.com',
  'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamail.biz', 'guerrillamail.de',
  'guerrillamail.info', 'guerrillamailblock.com', 'grr.la', 'sharklasers.com', 'spam4.me',
  'pokemail.net', 'guerrillamail.ru', 'guerrillamail.com.br',
  'temp-mail.org', 'temp-mail.io', 'tempmail.com', 'tempmail.net', 'tempmail.org', 'tempmail.dev',
  'tempmailo.com', 'tempmailaddress.com', 'tempemail.net', 'tempemail.co', 'tempemail.com',
  'tempemail.co.za', 'tempinbox.com', 'tempinbox.co.uk', 'tempr.email', 'tempymail.com',
  'throwawaymail.com', 'throwaway.email', 'throwawayemailaddresses.com', 'throwam.com',
  'yopmail.com', 'yopmail.fr', 'yopmail.net', 'yopmail.org', 'cool.fr.nf', 'jetable.fr.nf',
  'nospam.ze.tc', 'nomail.xl.cx', 'mega.zik.dj', 'speed.1s.fr', 'courriel.fr.nf',
  'moncourrier.fr.nf', 'monemail.fr.nf', 'monmail.fr.nf', 'jetable.com', 'jetable.net', 'jetable.org',
  'dispostable.com', 'discard.email', 'discardmail.com', 'discardmail.de', 'discardmail.co.uk',
  'fakeinbox.com', 'maildrop.cc', 'mailnesia.com', 'mailnull.com', 'mintemail.com', 'mytemp.email',
  'mytrashmail.com', 'trashmail.com', 'trashmail.net', 'trashmail.org', 'trashmail.de', 'trashmail.me',
  'trashymail.com', 'trashymail.net', 'mailmetrash.com', 'mailexpire.com', 'mailforspam.com',
  'getnada.com', 'nada.email', 'inboxkitten.com', 'moakt.com', 'mohmal.com', 'burnermail.io',
  'mailsac.com', 'mailslurp.com', 'mailcatch.com', 'mail-temporaire.fr', 'mail-temporaire.com',
  'temporarioemail.com.br', 'mailtemp.info', 'spamgourmet.com', 'spamgourmet.net', 'spamgourmet.org',
  'spamfree24.org', 'spam.la', 'spamavert.com', 'spambob.com', 'spambob.net', 'spambob.org',
  'spamdecoy.net', 'spamex.com', 'spamherelots.com', 'spamify.com', 'spammotel.com', 'spamspot.com',
  'fakemailgenerator.com', 'emailfake.com', 'generator.email', 'emailondeck.com', 'getairmail.com',
  'throwawaymailbox.com', 'anonymousemail.me', 'email-temp.com', 'linshiyouxiang.net',
  'harakirimail.com', 'meltmail.com', 'sofort-mail.de', 'kurzepost.de', 'papierkorb.me',
  'spambox.us', 'spamcannon.com', 'spamcannon.net', 'spamcon.org', 'spamcorptastic.com',
  'spamday.com', 'spamex.com', 'spamfighter.cf', 'spamfree.eu', 'spamgoes.in', 'spamhereplease.com',
  'spamify.com', 'spaminator.de', 'spamkill.info', 'spaml.com', 'spaml.de', 'spammotel.com',
  'spamobox.com', 'spamoff.de', 'spamslicer.com', 'spamstack.net', 'spamthis.co.uk',
  'spamthisplease.com', 'spamtroll.net', 'speed.1s.fr', 'supergreatmail.com', 'supermailer.jp',
  'suremail.info', 'teewars.org', 'teleworm.com', 'teleworm.us', 'tempalias.com', 'tempe-mail.com',
  'tempemail.biz', 'tempemail.org', 'tempinbox.com', 'temporaryemail.net', 'temporaryforwarding.com',
  'temporaryinbox.com', 'temporarymailaddress.com', 'tempsky.com', 'tempthe.net', 'thankyou2010.com',
  'thelimestones.com', 'thisisnotmyrealemail.com', 'thismail.net', 'throwawayemail.com',
  'tittbit.in', 'tmailinator.com', 'toiea.com', 'toomail.biz', 'topranklist.de', 'tradermail.info',
  'trash-amil.com', 'trash-mail.at', 'trash-mail.com', 'trash-mail.de', 'trash2009.com',
  'trashdevil.com', 'trashemail.de', 'trashmail.at', 'trashmail.io', 'trashmail.ws', 'trbvm.com',
  'trialmail.de', 'trickmail.net', 'trillianpro.com', 'turual.com', 'twinmail.de', 'tyldd.com',
  'uggsrock.com', 'umail.net', 'uroid.com', 'us.af', 'venompen.com', 'veryrealemail.com',
  'viditag.com', 'viewcastmedia.com', 'viewcastmedia.net', 'viewcastmedia.org', 'vomoto.com',
  'vpn.st', 'vsimcard.com', 'vubby.com', 'wasteland.rfc822.org', 'webemail.me', 'webm4il.info',
  'wegwerfadresse.de', 'wegwerfemail.com', 'wegwerfemail.de', 'wegwerfmail.de', 'wegwerfmail.net',
  'wegwerfmail.org', 'wh4f.org', 'whyspam.me', 'willhackforfood.biz', 'willselfdestruct.com',
  'winemaven.info', 'wronghead.com', 'wuzup.net', 'xagloo.com', 'xemaps.com', 'xents.com',
  'xmaily.com', 'xoxy.net', 'yep.it', 'yogamaven.com', 'yopmail.gq', 'ypmail.webarnak.fr.eu.org',
  'yuurok.com', 'zehnminutenmail.de', 'zippymail.info', 'zoaxe.com', 'zoemail.org',
  'mailme.lv', 'mailmetrash.com', 'mail-temp.com', 'mailtemp.net', 'mail-temporaire.com',
  'emailna.co', 'emailnax.com', 'mailsiphon.com', 'maileater.com', 'mailguard.me', 'mailimate.com',
  'mailismagic.com', 'mailjunk.cf', 'mailme.ir', 'mailme24.com', 'mailmetrash.com', 'mailmoat.com',
  'mailnator.com', 'mailnew.com', 'mailorg.org', 'mailpick.biz', 'mailproxsy.com', 'mailquack.com',
  'mailrock.biz', 'mailsac.com', 'mailscrap.com', 'mailseal.de', 'mailshell.com', 'mailsiphon.com',
  'mailslapping.com', 'mailslite.com', 'mailtemp.info', 'mailtome.de', 'mailtothis.com',
  'mailtrash.net', 'mailtv.net', 'mailzilla.com', 'mailzilla.org', 'mbx.cc', 'mega.zik.dj',
  'meinspamschutz.de', 'meltmail.com', 'messagebeamer.de', 'mezimages.net', 'mierdamail.com',
  'migumail.com', 'mintemail.com', 'moburl.com', 'moncourrier.fr.nf', 'monemail.fr.nf',
  'monmail.fr.nf', 'monumentmail.com', 'mt2009.com', 'mt2014.com', 'mx0.wwwnew.eu', 'mycard.net.ua',
  'mycleaninbox.net', 'myemailboxy.com', 'mymail-in.net', 'mymailoasis.com', 'mypacks.net',
  'mypartyclip.de', 'myphantomemail.com', 'myspaceinc.com', 'myspaceinc.net', 'myspaceinc.org',
  'myspacepimpedup.com', 'myspamless.com', 'mytempemail.com', 'mytempmail.com', 'mytrashmail.com',
  'nabuma.com', 'neomailbox.com', 'nepwk.com', 'nervmich.net', 'nervtmich.net', 'netmails.com',
  'netmails.net', 'netzidiot.de', 'neverbox.com', 'nice-4u.com', 'nincsmail.hu', 'nnh.com',
  'no-spam.ws', 'noblepioneer.com', 'nomail.pw', 'nomail.xl.cx', 'nomail2me.com', 'nomorespamemails.com',
  'nonspam.eu', 'nonspammer.de', 'noref.in', 'nospam.ze.tc', 'nospam4.us', 'nospamfor.us',
  'nospammail.net', 'nospamthanks.info', 'nothingtoseehere.ca', 'notmailinator.com', 'nowhere.org',
  'nowmymail.com', 'nurfuerspam.de', 'nus.edu.sg', 'nwldx.com', 'objectmail.com', 'obobbo.com',
  'odaymail.com', 'oneoffemail.com', 'onewaymail.com', 'onlatedotcom.info', 'online.ms',
  'oopi.org', 'opayq.com', 'ordinaryamerican.net', 'otherinbox.com', 'ourklips.com', 'outlawspam.com',
  'ovpn.to', 'owlpic.com', 'pancakemail.com', 'pimpedupmyspace.com', 'pjjkp.com', 'plexolan.de',
  'politikerclub.de', 'poofy.org', 'pookmail.com', 'privacy.net', 'proxymail.eu', 'prtnx.com',
  'punkass.com', 'putthisinyourspamdatabase.com', 'pwrby.com', 'qq.com', 'quickinbox.com',
  'rcpt.at', 'recode.me', 'recursor.net', 'regbypass.com', 'regbypass.comsafe-mail.net',
  'rejectmail.com', 'rklips.com', 'rmqkr.net', 'rppkn.com', 'rtrtr.com', 's0ny.net', 'safe-mail.net',
  'safersignup.de', 'safetymail.info', 'safetypost.de', 'sandelf.de', 'saynotospams.com',
  'selfdestructingmail.com', 'sendspamhere.com', 'sharklasers.com', 'shiftmail.com', 'shitmail.me',
  'shortmail.net', 'sibmail.com', 'skeefmail.com', 'slaskpost.se', 'slopsbox.com', 'slushmail.com',
  'smellfear.com', 'snakemail.com', 'sneakemail.com', 'sofort-mail.de', 'softpls.asia',
  'sogetthis.com', 'soisz.com', 'solvemail.info', 'soodomail.com', 'soodonims.com', 'spam.la',
  'spam.su', 'spamail.de', 'spamarrest.com', 'spamavert.com', 'spambob.com', 'spambob.net',
  'spambob.org', 'spambog.com', 'spambog.de', 'spambog.ru', 'spambox.info', 'spambox.irishspringrealty.com',
  'spambox.us', 'spamcannon.com', 'spamcannon.net', 'spamcon.org', 'spamcorptastic.com', 'spamcowboy.com',
  'spamcowboy.net', 'spamcowboy.org', 'spamday.com', 'spamdecoy.net', 'spameater.com', 'spameater.org',
  'spamex.com', 'spamfree.eu', 'spamfree24.com', 'spamfree24.de', 'spamfree24.eu', 'spamfree24.info',
  'spamfree24.net', 'spamfree24.org', 'spamgoes.in', 'spamgourmet.com', 'spamgourmet.net',
  'spamgourmet.org', 'spamherelots.com', 'spamhereplease.com', 'spamhole.com', 'spamify.com',
  'spaminator.de', 'spamkill.info', 'spaml.com', 'spaml.de', 'spammotel.com', 'spamobox.com',
  'spamoff.de', 'spamslicer.com', 'spamspot.com', 'spamstack.net', 'spamthis.co.uk',
  'spamthisplease.com', 'spamtroll.net', 'speed.1s.fr', 'spikio.com', 'spoofmail.de', 'squizzy.de',
  'ssoia.com', 'startkeys.com', 'stinkefinger.net', 'stop-my-spam.com', 'stuffmail.de',
  'super-auswahl.de', 'supergreatmail.com', 'supermailer.jp', 'superrito.com', 'superstachel.de',
  'suremail.info', 'svk.jp', 'sweetxxx.de', 'tafmail.com', 'tagyourself.com', 'talkinator.com',
  'tapchicuoihoi.com', 'teewars.org', 'teleworm.com', 'teleworm.us', 'temp.emeraldwebmail.com',
  'temp.headstrong.de', 'tempail.com', 'tempalias.com', 'tempe-mail.com', 'tempemail.biz',
  'tempemail.co.za', 'tempemail.com', 'tempemail.net', 'tempinbox.co.uk', 'tempinbox.com',
  'tempmail.eu', 'tempmail.it', 'tempmail2.com', 'tempmaildemo.com', 'tempmailer.com',
  'tempmailer.de', 'tempomail.fr', 'temporarily.de', 'temporarioemail.com.br', 'temporaryemail.net',
  'temporaryforwarding.com', 'temporaryinbox.com', 'temporarymailaddress.com', 'tempthe.net',
  'tempymail.com', 'tempthe.net', 'thankyou2010.com', 'thecloudindex.com', 'thediamants.org',
  'thelimestones.com', 'thisisnotmyrealemail.com', 'thismail.net', 'throwawayemailaddresses.com',
  'tilien.com', 'tittbit.in', 'tizi.com', 'tmail.ws', 'tmailinator.com', 'toiea.com', 'toomail.biz',
  'topranklist.de', 'tradermail.info', 'trash-amil.com', 'trash-mail.at', 'trash-mail.com',
  'trash-mail.de', 'trash2009.com', 'trashdevil.com', 'trashemail.de', 'trashmail.at',
  'trashmail.com', 'trashmail.io', 'trashmail.me', 'trashmail.net', 'trashmail.org', 'trashmail.ws',
  'trbvm.com', 'trialmail.de', 'trickmail.net', 'trillianpro.com', 'turual.com', 'twinmail.de',
  'tyldd.com', 'uggsrock.com', 'umail.net', 'uroid.com', 'venompen.com', 'veryrealemail.com',
  'viditag.com', 'viewcastmedia.com', 'viewcastmedia.net', 'viewcastmedia.org', 'vomoto.com',
  'vpn.st', 'vsimcard.com', 'vubby.com', 'wasteland.rfc822.org', 'webemail.me', 'webm4il.info',
  'wegwerfadresse.de', 'wegwerfemail.com', 'wegwerfemail.de', 'wegwerfmail.de', 'wegwerfmail.net',
  'wegwerfmail.org', 'wh4f.org', 'whyspam.me', 'willhackforfood.biz', 'willselfdestruct.com',
  'winemaven.info', 'wronghead.com', 'wuzup.net', 'xagloo.com', 'xemaps.com', 'xents.com',
  'xmaily.com', 'xoxy.net', 'yep.it', 'yogamaven.com', 'yopmail.gq', 'yuurok.com',
  'zehnminutenmail.de', 'zippymail.info', 'zoaxe.com', 'zoemail.org',
];

let domainSet = new Set(FALLBACK_DOMAINS);
let lastLoadedAt = 0;
let inFlight = null;

/**
 * Fetch the maintained blocklist and swap it into memory.
 * Safe to call repeatedly — concurrent calls share one request.
 */
export const refreshDisposableList = async () => {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch(LIST_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const text = await res.text();
      const domains = text
        .split(/\r?\n/)
        .map((line) => line.trim().toLowerCase())
        .filter((line) => line && !line.startsWith('#'));

      if (domains.length > 100) {
        domainSet = new Set([...FALLBACK_DOMAINS, ...domains]);
        lastLoadedAt = Date.now();
        console.log(`[disposable-email] loaded ${domains.length} disposable domains`);
      } else {
        throw new Error(`unexpected list size (${domains.length})`);
      }
    } catch (err) {
      console.warn('[disposable-email] blocklist refresh failed, using fallback list:', err.message);
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
};

/**
 * Call once at startup (fire-and-forget) so the list is ready before the first
 * signup arrives. e.g. in app.js:  warmupDisposableList();
 */
export const warmupDisposableList = () => {
  refreshDisposableList().catch(() => {});
};

/**
 * Returns true when the email belongs to a known disposable / temporary provider.
 * Never throws — a malformed address returns false and is left to normal validation.
 */
export const isDisposableEmail = (email) => {
  if (!email || typeof email !== 'string') return false;

  // Non-blocking: refresh in the background if the list is stale.
  if (Date.now() - lastLoadedAt > REFRESH_INTERVAL_MS) {
    refreshDisposableList().catch(() => {});
  }

  const at = email.lastIndexOf('@');
  if (at === -1) return false;

  const domain = email.slice(at + 1).toLowerCase().trim();
  if (!domain) return false;

  // Match the full domain and its base (so `x@foo.mailinator.com` is caught).
  const parts = domain.split('.');
  const baseDomain = parts.length > 2 ? parts.slice(-2).join('.') : domain;

  return domainSet.has(domain) || domainSet.has(baseDomain);
};
