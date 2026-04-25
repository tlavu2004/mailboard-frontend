import React from 'react';
import { Button, Typography, Space, Avatar, Card, Empty, Spin, Popover, Tag, Tooltip, message, Alert } from 'antd';
import {
  ArrowLeftOutlined,
  StarOutlined,
  StarFilled,
  DeleteOutlined,
  PaperClipOutlined,
  ExportOutlined,
  ReloadOutlined,
  RobotOutlined,
  ClockCircleOutlined,
  DownloadOutlined,
  FileOutlined,
  CloudDownloadOutlined,
  LinkOutlined,
  UserOutlined,
  InboxOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Email } from '@/types/email';
import SnoozePopover from './SnoozePopover';

const { Title, Text } = Typography;

const parseAsLocalDate = (value?: string): Date => {
  if (!value) return new Date();
  const trimmed = value.trim();
  const hasTimezone = /([zZ]|[+\-]\d{2}:?\d{2})$/.test(trimmed);
  const normalized = hasTimezone ? trimmed : `${trimmed}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? new Date(trimmed) : parsed;
};

interface EmailDetailProps {
  email: Email | null;
  onBack: () => void;
  onStar: (e: React.MouseEvent, email: Email) => void;
  onDelete: (e: React.MouseEvent, email: Email) => void;
  onSpam?: (email: Email) => void;
  onRestore?: (email: Email) => void;
  onReply?: (email: Email) => void;
  onReplyAll?: (email: Email) => void;
  onForward?: (email: Email) => void;
  onRefresh?: (email: Email) => void;
  onSummarize?: (email: Email) => void;
  loadingSummary?: boolean;
  onSnooze?: (emailId: string, until: string) => void;
  onDownloadAttachment: (emailId: string, attachmentId: string, filename: string) => void;
  showMobileDetail: boolean;
  showBackButton?: boolean;
  className?: string;
  style?: React.CSSProperties;
  inlineAlertMessage?: string;
  onInlineAlertClose?: () => void;
}

const EmailDetail: React.FC<EmailDetailProps> = ({
  email,
  onBack,
  onStar,
  onDelete,
  onSpam,
  onRestore,
  onReply,
  onReplyAll,
  onForward,
  onRefresh,
  onSummarize,
  loadingSummary,
  onSnooze,
  onDownloadAttachment,
  showMobileDetail,
  showBackButton,
  className,
  style,
  inlineAlertMessage,
  onInlineAlertClose,
}) => {
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Generate Gmail URL for opening email in Gmail
  const getGmailUrl = (email: Email) => {
    // If we have a direct gmailLink from backend, use it
    // But replace /u/0/ with /u/accountEmail/ if available to handle multi-account login
    let url = email.gmailLink;

    if (!url) {
      const msgId: string = email.messageId || email.id || '';
      url = `https://mail.google.com/mail/u/0/#search/rfc822msgid:${encodeURIComponent(msgId)}`;
    }

    // Normalize any /u/<something>/ segment to /u/0/ and ensure authuser query param
    try {
      // Replace any /u/<whatever>/ with /u/0/ to avoid using an email in the path which can cause Gmail 404
      url = url.replace(/\/u\/[^\/]+\//, '/u/0/');

      // If authuser already present, return as-is
      if (!url.includes('authuser=')) {
        const parts = url.split('#');
        const base = parts[0];
        const frag = parts[1] ? '#' + parts[1] : '';
        const sep = base.includes('?') ? '&' : '?';
        if (email.accountEmail) {
          url = `${base}${sep}authuser=${encodeURIComponent(email.accountEmail)}${frag}`;
        } else {
          url = `${base}${frag}`;
        }
      }
    } catch (e) {
      console.warn('[EmailDetail] Failed to normalize gmail url', e);
    }

    return url;
  };

  const handleOpenInGmail = () => {
    if (email) {
      window.open(getGmailUrl(email), '_blank', 'noopener,noreferrer');
    }
  };

  const mailboxId = (email?.mailboxId || '').toUpperCase();
  const canRestore = mailboxId === 'TRASH' || mailboxId === 'SPAM';
  const canMarkSpam = mailboxId !== 'SPAM' && mailboxId !== 'TRASH' && mailboxId !== 'SENT' && mailboxId !== 'DRAFTS' && mailboxId !== 'DRAFT';
  const canDelete = mailboxId !== 'TRASH';

  const [iframeHeight, setIframeHeight] = React.useState<number>(400);
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);

  const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const inspectHtml = async () => {
    try {
      const el = iframeRef.current;
      if (!el) {
        message.error('Iframe not mounted');
        return;
      }
      const win = el.contentWindow;
      if (!win) {
        message.error('Iframe window not available');
        return;
      }

      const html: string = await new Promise((resolve, reject) => {
        const handler = (ev: MessageEvent) => {
          try {
            if (ev.source === win && ev.data && ev.data.type === 'MB_HTML_RESPONSE' && typeof ev.data.html === 'string') {
              window.removeEventListener('message', handler);
              resolve(ev.data.html);
            }
          } catch (err) {
            // ignore
          }
        };

        // Timeout in 3s
        const timer = setTimeout(() => {
          window.removeEventListener('message', handler);
          reject(new Error('Timeout waiting for iframe response'));
        }, 3000);

        window.addEventListener('message', handler);
        try {
          win.postMessage({ type: 'MB_REQUEST_HTML' }, '*');
        } catch (err) {
          clearTimeout(timer);
          window.removeEventListener('message', handler);
          reject(err);
        }
      });

      await navigator.clipboard.writeText(html);
      message.success('Email HTML copied to clipboard');
      console.log('[EmailDetail] Copied iframe HTML to clipboard');
    } catch (e) {
      console.error('[EmailDetail] inspectHtml error', e);
      message.error('Failed to copy iframe HTML');
    }
  };

  const buildSrcDoc = (bodyHtml: string | undefined, fromEmail?: string) => {
    const overrideCss = `
      <style>
        /* Very small, non-invasive overrides to preserve original email layout */
        html,body{margin:0;padding:0;box-sizing:border-box;background:transparent}
        *,*::before,*::after{box-sizing:border-box}
        /* Allow images/embeds to scale down if too large, but don't change display or table layout */
        img,video,iframe,embed,object{max-width:100% !important;height:auto !important}
        pre,code,blockquote{white-space:pre-wrap !important;word-break:break-word !important}

        /* Force light-mode rendering for emails that include dark-mode helpers */
        body, .body { background-color: #ffffff !important; color: #000000 !important; }
        [class*="dark-mode-background-color-"], .dark-mode-background-color-000000, body.dark-mode-background-color-000000 { background-color: #ffffff !important; color: #000000 !important; }

        /* Ensure light-mode images are shown and dark-mode variants hidden */
        .light-mode-image:not([class^="x_"]) { display: block !important; }
        .dark-mode-image:not([class^="x_"]) { display: none !important; }

        /* Restore readable colors for dark-mode helpers */
        [class*="dark-mode-color-"], [class*="dark-mode-link-color-"] { color: inherit !important; }
        [class*="dark-mode-link-color-"] a { color: inherit !important; }

        /* Target LinkedIn header badge only (very narrow scope) */
        .mercado-container img[data-test-header-static-badging-img] {
          width: 101px !important;
          height: 37px !important;
          max-width: none !important;
          vertical-align: middle !important;
          display: inline-block !important;
        }
        /* Keep header notification icons slightly larger for readability */
        [data-test-header-notification-badges] img {
          width: 30px !important;
          height: 30px !important;
          max-width: none !important;
          vertical-align: middle !important;
          display: inline-block !important;
          object-fit: contain !important;
        }
        /* Scoped rule applied by runtime when a dark container is detected */
        [data-mb-force-light], [data-mb-force-light] * {
          background-color: #ffffff !important;
          color: #000000 !important;
          background-image: none !important;
          filter: none !important;
          mix-blend-mode: normal !important;
          -webkit-text-fill-color: #000000 !important;
        }
      </style>
      <script>
        (function(){
          // Respond to parent requests for the iframe HTML (used only for local debugging)
          window.addEventListener('message', function(e){
            try{
              var d = e && e.data;
              if (d && d.type === 'MB_REQUEST_HTML'){
                var html = document.documentElement.outerHTML;
                window.parent.postMessage({ type: 'MB_HTML_RESPONSE', html: html }, '*');
              }
              if (d && d.type === 'MB_REQUEST_COMPUTED' && typeof d.selector === 'string'){
                try{
                  var node = document.querySelector(d.selector);
                  var out = null;
                  if (node) {
                    var cs = window.getComputedStyle(node);
                    out = {};
                    // send a compact set of useful properties
                    ['width','height','display','max-width','background-color','color'].forEach(function(p){ out[p]=cs.getPropertyValue(p); });
                    out.tag = node.tagName;
                    out.html = node.outerHTML && node.outerHTML.slice(0,2000);
                  }
                  window.parent.postMessage({ type: 'MB_COMPUTED_RESPONSE', selector: d.selector, computed: out }, '*');
                } catch(err2) {
                  window.parent.postMessage({ type: 'MB_COMPUTED_RESPONSE', selector: d.selector, error: String(err2) }, '*');
                }
              }
            } catch(err) { /* ignore */ }
          }, false);

          // DOM fixes to counter author dark-mode helpers and to normalize LinkedIn header images.
          function applyRuntimeFixes(){
            try{
              // Quick baseline resets
              try{ document.documentElement.style.backgroundColor = '#ffffff'; } catch(e){}
              try{ if (document.body) { document.body.style.backgroundColor = '#ffffff'; document.body.style.color = '#000000'; } } catch(e){}

              // First pass: remove global filters/blend-modes that commonly invert colors
              try{
                Array.prototype.forEach.call(document.querySelectorAll('*'), function(n){
                  try{
                    n.style.filter = 'none';
                    n.style.mixBlendMode = 'normal';
                    n.style.webkitMixBlendMode = 'normal';
                    n.style.webkitTextFillColor = '';
                  } catch(e){}
                });
              } catch(e){}

              // Show/hide mode-specific images where these helper classes exist
              try{
                Array.prototype.forEach.call(document.querySelectorAll('.light-mode-image:not([class^="x_"])'), function(n){ n.style.display = 'block'; });
                Array.prototype.forEach.call(document.querySelectorAll('.dark-mode-image:not([class^="x_"])'), function(n){ n.style.display = 'none'; });
              } catch(e){}

              // LinkedIn badge fallback sizing (narrow, non-invasive)
              try{
                var badge = document.querySelector('img[data-test-header-static-badging-img]');
                if (!badge) {
                  var mc = document.querySelector('.mercado-container');
                  if (mc) badge = mc.querySelector('img');
                }
                if (badge) {
                  try{
                    badge.style.width = '101px';
                    badge.style.height = '37px';
                    badge.style.maxWidth = 'none';
                    badge.style.verticalAlign = 'middle';
                    badge.style.display = 'inline-block';
                  } catch(e){}
                }
              } catch(e){}

              try{
                Array.prototype.forEach.call(document.querySelectorAll('[data-test-header-notification-badges] img'), function(ic){
                  try{
                    ic.style.width = '30px';
                    ic.style.height = '30px';
                    ic.style.maxWidth = 'none';
                    ic.style.verticalAlign = 'middle';
                    ic.style.display = 'inline-block';
                    ic.style.objectFit = 'contain';
                  } catch(e){}
                });
              } catch(e){}

              // Cap large banner/header images (mktoImg, hero banners) to avoid oversized
              // rendering compared to common email clients like Gmail.
              try{
                Array.prototype.forEach.call(document.querySelectorAll('.mktoImg img, img[role="none"]'), function(img){
                  try{
                    var nw = img.naturalWidth || parseInt(img.getAttribute('width')) || 0;
                    if (nw >= 500){
                      img.style.maxWidth = '520px';
                      img.style.width = 'auto';
                      img.style.height = 'auto';
                      img.style.display = 'block';
                      img.style.marginLeft = 'auto';
                      img.style.marginRight = 'auto';
                    }
                  }catch(e){}
                });
              } catch(e){}

              // Contrast helpers: compute luminance and set text color to ensure readability
              function parseRgb(rgb){
                try{
                  if(!rgb) return null;
                  var m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/);
                  if(!m) return null;
                  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] ? Number(m[4]) : 1 };
                } catch(e){ return null; }
              }

              function luminanceFromRgb(o){
                try{
                  var r = o.r/255, g = o.g/255, b = o.b/255;
                  r = r <= 0.03928 ? r/12.92 : Math.pow((r+0.055)/1.055, 2.4);
                  g = g <= 0.03928 ? g/12.92 : Math.pow((g+0.055)/1.055, 2.4);
                  b = b <= 0.03928 ? b/12.92 : Math.pow((b+0.055)/1.055, 2.4);
                  return 0.2126*r + 0.7152*g + 0.0722*b;
                } catch(e){ return 0; }
              }

              function isDarkColor(rgb){
                try{
                  var o = parseRgb(rgb);
                  if(!o) return false;
                  var lum = luminanceFromRgb(o);
                  return lum < 0.45;
                } catch(e){ return false; }
              }

              function ensureReadableText(){
                try{
                  var nodes = document.querySelectorAll('p,div,span,td,th,h1,h2,h3,a,li,label,strong,em');
                  Array.prototype.forEach.call(nodes, function(n){
                    try{
                      var cs = window.getComputedStyle(n);
                      var bg = cs && cs.backgroundColor;
                      var bgImage = cs && cs.backgroundImage;
                      var dark = isDarkColor(bg) || (bgImage && bgImage !== 'none' && bgImage !== 'initial');
                      if (dark){
                        n.style.color = '#ffffff';
                        n.style.webkitTextFillColor = '#ffffff';
                      } else {
                        n.style.color = '#000000';
                        n.style.webkitTextFillColor = '#000000';
                      }
                      n.style.filter = 'none';
                      n.style.mixBlendMode = 'normal';
                      n.style.webkitMixBlendMode = 'normal';
                    } catch(e){}
                  });
                } catch(e){}
              }

              // Run immediately and a few times for dynamic templates; attach observer to re-run on changes
              ensureReadableText();
              try{
                if (!window.__mbContrastObserverAttached && window.MutationObserver){
                  var root = document.documentElement || document.body;
                  var observer = new MutationObserver(function(){ ensureReadableText(); });
                  observer.observe(root, { attributes: true, childList: true, subtree: true, attributeFilter: ['style','class'] });
                  window.__mbContrastObserverAttached = true;
                }
              } catch(e){}

              try{
                var tries = 0;
                var intv = setInterval(function(){ ensureReadableText(); tries++; if (tries > 8) clearInterval(intv); }, 500);
              } catch(e){}

            } catch(ignore){}
          }

          if (document.readyState === 'complete' || document.readyState === 'interactive'){
            setTimeout(applyRuntimeFixes, 1);
          } else {
            document.addEventListener('DOMContentLoaded', applyRuntimeFixes);
          }
        })();
      </script>
    `;

    let body = bodyHtml || '';
    // Remove any existing viewport meta tags which can cause unexpected scaling inside our iframe
    body = body.replace(/<\s*meta[^>]*name\s*=\s*["']viewport["'][^>]*>/gi, '');
    const viewportMeta = `<meta name="viewport" content="width=device-width, initial-scale=1">`;

    try {
      // If this email is from a provider known to ship dark-mode helpers (Vercel, edX),
      // append a focused aggressive override that forces light backgrounds inside the
      // email container. This minimizes collateral effects on other templates.
      var lcFrom = (fromEmail || '').toLowerCase();
      var extra = '';
      if (lcFrom.indexOf('vercel.com') !== -1 || lcFrom.indexOf('edx.org') !== -1 || lcFrom.indexOf('coursera.org') !== -1 || lcFrom.indexOf('jetbrains.com') !== -1 || lcFrom.indexOf('jetbrains') !== -1) {
        extra = `
          <style>
            /* Aggressive light-mode override for known problematic templates (scoped) */
            :root, html, body, #main, .section, .block-grid, .block-grid-outlook, .mj-column-per-100, .container, .mercado-container, table, td, div, [class*="darkmode"], [class*="dark-mode"], .darkmode, .darkmode2, .darkmode3 {
              background-color: #ffffff !important;
              color: #000000 !important;
              background-image: none !important;
              filter: none !important;
              mix-blend-mode: normal !important;
              -webkit-text-fill-color: #000000 !important;
            }

            /* Hide dark-mode images and show light-mode variants when available */
            .light-img, .light-mode-image, img.light-img, img.light-mode-image { display: block !important; }
            .dark-img, .dark-mode-image, img.dark-img, img.dark-mode-image { display: none !important; }

            /* Ensure pseudo-element backgrounds do not create dark gutters */
            *::before, *::after, [class*="darkmode"]::before, [class*="darkmode"]::after {
              background: transparent !important;
              background-image: none !important;
            }

            /* JetBrains-specific helpers */
            .dm-reverse { background-color: #ffffff !important; color: #000000 !important; }
            .dm-white { color: #000000 !important; }
            u + .body .gmail-blend-screen, u + .body .gmail-blend-difference, .gmail-blend-screen, .gmail-blend-difference {
              background: transparent !important;
              mix-blend-mode: normal !important;
              filter: none !important;
            }
            div[style*="background-color"], td[style*="background-color"], div[style*="ffffff"], td[style*="ffffff"] {
              background-color: #ffffff !important;
              color: #000000 !important;
              background-image: none !important;
              filter: none !important;
              mix-blend-mode: normal !important;
              -webkit-text-fill-color: #000000 !important;
            }

            /* Also override dark-mode media rules (applies when user prefers dark scheme) */
            @media (prefers-color-scheme: dark) {
              html, body, .darkmode, .darkmode * {
                background-color: #ffffff !important;
                color: #000000 !important;
                background-image: none !important;
                filter: none !important;
                mix-blend-mode: normal !important;
                -webkit-text-fill-color: #000000 !important;
              }
              .dm-reverse { background-color: #ffffff !important; color: #000000 !important; }
              u + .body .gmail-blend-screen, u + .body .gmail-blend-difference, .gmail-blend-screen, .gmail-blend-difference { background: transparent !important; mix-blend-mode: normal !important; filter: none !important; }
              *::before, *::after { background: transparent !important; background-image: none !important; }
            }
          </style>
          <script>
            (function(){
              // Aggressively mark likely dark containers so the injected CSS above can target them
              function markDarkContainers(){
                try{
                  var candidates = document.querySelectorAll('html, body, .darkmode, .darkmode2, .darkmode3, [class*="dark-mode"], [class*="darkmode"], .mercado-container, .container, table, td, div, section, main, header, footer');
                  Array.prototype.forEach.call(candidates, function(n){
                    try{
                      n.setAttribute('data-mb-force-light', '1');
                      try{
                        n.style.setProperty('background-color', '#ffffff', 'important');
                        n.style.setProperty('color', '#000000', 'important');
                        n.style.setProperty('background-image', 'none', 'important');
                        n.style.setProperty('filter', 'none', 'important');
                        n.style.setProperty('mix-blend-mode', 'normal', 'important');
                        n.style.setProperty('-webkit-text-fill-color', '#000000', 'important');
                      }catch(e){}
                    }catch(e){}
                  });

                  // also ensure root elements get inline priority
                  try{
                    if (document.documentElement){
                      document.documentElement.setAttribute('data-mb-force-light','1');
                      try{
                        document.documentElement.style.setProperty('background-color','#ffffff','important');
                        document.documentElement.style.setProperty('color','#000000','important');
                        document.documentElement.style.setProperty('background-image','none','important');
                        document.documentElement.style.setProperty('filter','none','important');
                        document.documentElement.style.setProperty('mix-blend-mode','normal','important');
                        document.documentElement.style.setProperty('-webkit-text-fill-color','#000000','important');
                      }catch(e){}
                    }
                  }catch(e){}

                  try{
                    if (document.body){
                      document.body.setAttribute('data-mb-force-light','1');
                      try{
                        document.body.style.setProperty('background-color','#ffffff','important');
                        document.body.style.setProperty('color','#000000','important');
                        document.body.style.setProperty('background-image','none','important');
                        document.body.style.setProperty('filter','none','important');
                        document.body.style.setProperty('mix-blend-mode','normal','important');
                        document.body.style.setProperty('-webkit-text-fill-color','#000000','important');
                      }catch(e){}
                    }
                  }catch(e){}

                  // Add final defensive rule only once and ensure it is appended *after* the email's own styles
                  var ensureStyle = function(){
                    try{
                      var existing = document.getElementById('__mb_force_light_style');
                      var css = 'html[data-mb-force-light], body[data-mb-force-light], [data-mb-force-light], [data-mb-force-light] * { background-color: #ffffff !important; color: #000000 !important; background-image: none !important; filter: none !important; mix-blend-mode: normal !important; -webkit-text-fill-color: #000000 !important; } [data-mb-force-light]::before, [data-mb-force-light]::after { background: transparent !important; background-image: none !important; } *::before, *::after { background: transparent !important; background-image: none !important; } .dark-img { display: none !important; } .light-img { display: block !important; } .dm-reverse { background-color: #ffffff !important; color: #000000 !important; } .dm-white { color: #000000 !important; } u + .body .gmail-blend-screen, u + .body .gmail-blend-difference, .gmail-blend-screen, .gmail-blend-difference { background: transparent !important; mix-blend-mode: normal !important; filter: none !important; }';
                      if (!existing){
                        var s = document.createElement('style');
                        s.id = '__mb_force_light_style';
                        s.innerHTML = css;
                        try{ (document.body || document.documentElement || document.head).appendChild(s); }catch(e){ try{ document.head.appendChild(s); }catch(e){} }
                      } else {
                        try{ (document.body || document.documentElement || document.head).appendChild(existing); }catch(e){}
                      }
                    }catch(e){}
                  };

                  ensureStyle();

                  // keep our style element moved to the end if the email injects new styles later
                  try{
                    if (!window.__mb_force_light_style_observer && window.MutationObserver){
                      var obs = new MutationObserver(function(muts){
                        try{
                          var el = document.getElementById('__mb_force_light_style');
                          if (el) {
                            try{ (document.body || document.documentElement || document.head).appendChild(el); }catch(e){}
                          } else {
                            ensureStyle();
                          }
                        }catch(e){}
                      });
                      var root = document.head || document.documentElement;
                      obs.observe(root, { childList: true, subtree: true });
                      window.__mb_force_light_style_observer = true;
                    }
                  }catch(e){}

                  // If a conservative contrast helper exists, run it again to apply inline readable colors
                  try{ if (typeof ensureReadableText === 'function') setTimeout(ensureReadableText, 50); }catch(e){}

                }catch(e){}
              }

              if (document.readyState === 'complete' || document.readyState === 'interactive'){
                setTimeout(markDarkContainers, 10);
              } else {
                document.addEventListener('DOMContentLoaded', markDarkContainers);
              }
            })();
          <\/script>
        `;
      }

      if (body.match(/<\s*\/head\s*>/i)) {
        return body.replace(/<\s*\/head\s*>/i, `${viewportMeta}${overrideCss}${extra}</head>`);
      }

      if (body.match(/<\s*head[^>]*>/i)) {
        return body.replace(/<\s*head([^>]*)>/i, `<head$1>${viewportMeta}${overrideCss}${extra}`);
      }

      if (body.match(/<\s*html[^>]*>/i)) {
        return body.replace(/<\s*html([^>]*)>/i, `<html$1><head>${viewportMeta}${overrideCss}${extra}</head>`);
      }

      // Fallback: return original fragment wrapped with minimal head (no base tag)
      return `<!doctype html><html><head>${viewportMeta}${overrideCss}${extra}</head><body>${body}</body></html>`;
    } catch (e) {
      // On any error, return a safe wrapper with minimal head
      return `<!doctype html><html><head>${overrideCss}</head><body>${body}</body></html>`;
    }
  };

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'MB_RESIZE' && typeof event.data.height === 'number') {
        // Sanity check: prevent runaway height if the bridge reports massive values (V10.20)
        const cappedHeight = Math.min(event.data.height + 20, 10000);
        setIframeHeight(Math.max(cappedHeight, 400));
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // V20: Force reset iframe height to baseline when switching emails to prevent "height memory" (Leaking tall layouts)
  React.useEffect(() => {
    if (email?.id) {
      console.log('[EmailDetail] Resetting iframe height for new email ID:', email.id);
      setIframeHeight(400);
    }
  }, [email?.id]);

  if (!email) {
    return (
      <Empty
        description="Select an email to view details"
        style={{ marginTop: '20%' }}
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    );
  }

  console.log('[EmailDetail] Rendering with email:', {
    id: email.id,
    subject: email.subject,
    hasAttachments: email.hasAttachments,
    attachmentsCount: email.attachments?.length,
    summarySource: email.summarySource
  });

  // Alias sender and date for compatibility between list-view and detail-view DTOs (V10.27)
  const getSenderInfo = () => {
    // If it's an object {name, email}
    if (typeof email.from === 'object' && email.from !== null) {
      return {
        name: email.from.name || (email as any).fromName,
        email: email.from.email
      };
    }
    // If it's a string, use fromName as name
    return {
      name: (email as any).fromName || (typeof email.from === 'string' ? email.from : 'Unknown Sender'),
      email: typeof email.from === 'string' ? email.from : ''
    };
  };

  const sender = getSenderInfo();
  const toList = (email.to || []).filter(Boolean);
  const rawCcList = email.cc || [];
  const ccList = (rawCcList || []).map((r: any) => (typeof r === 'string' ? r.trim() : r)).filter((r: any) => {
    if (!r) return false;
    if (typeof r === 'string') return r.length > 0;
    if (typeof r === 'object') return Boolean(r.email || r.name);
    return true;
  });
  const displayDate = email.receivedAt || email.createdAt || (email as any).sentAt;

  // Helper to render recipient strings regardless of DTO format (V10.28)
  const renderRecipientList = (list: any[]) => {
    return list.map((item: any) => {
      if (typeof item === 'string') return item;
      return item.email || item.name || '';
    }).filter(Boolean).join(', ');
  };

  return (
    <div
      className={className}
      style={{ ...style, height: '100%', overflowY: 'auto', backgroundColor: '#f8fafc', padding: '12px' }}
    >
      {showBackButton && (
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={onBack}
          style={{ margin: '8px 16px' }}
          className="mobile-back-button"
        >
          Back
        </Button>
      )}

      <div style={{ width: '100%', margin: 0, padding: showMobileDetail ? '0 12px 12px' : '0 12px' }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {inlineAlertMessage && (
            <div style={{ width: '100%' }}>
              <Alert
                message={inlineAlertMessage}
                type="warning"
                showIcon
                closable
                onClose={() => onInlineAlertClose && onInlineAlertClose()}
                style={{ marginBottom: 6 }}
              />
            </div>
          )}
          <div style={{ marginBottom: '8px' }}>
            <Title level={3} style={{ marginTop: '12px', marginBottom: '8px' }}>{email.subject}</Title>
          </div>

          {/* V28.4: Metadata move up (Below Title, Above Buttons) */}
          <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Avatar
                  icon={<UserOutlined />}
                  style={{ backgroundColor: '#1a73e8' }}
                  size={40}
                />
                <div>
                  <div style={{ fontWeight: 600, color: '#202124', fontSize: '14px' }}>
                    {email.from?.name || email.from?.email || email.sender}
                  </div>
                  <div style={{ fontSize: '12px', color: '#5f6368' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 600, color: '#5f6368', fontSize: '12px' }}>To:</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {toList && toList.length > 0 ? (
                          toList.map((r: any, idx: number) => (
                            <Tag key={r.email || r.name || idx} style={{ margin: 0 }}>
                              {typeof r === 'string' ? r : (r.name || r.email)}
                            </Tag>
                          ))
                        ) : (
                          <span>me</span>
                        )}
                      </div>

                      {ccList && ccList.length > 0 && (
                        <Popover
                          content={
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 420 }}>
                              {ccList.map((r: any, idx: number) => (
                                <Tag key={r.email || r.name || idx} style={{ margin: 0 }}>
                                  {typeof r === 'string' ? r : (r.name || r.email)}
                                </Tag>
                              ))}
                            </div>
                          }
                          title={`Cc (${ccList.length})`}
                          trigger="click"
                        >
                          <Tag color="default" style={{ cursor: 'pointer', marginLeft: 8 }}>Cc: {ccList.length}</Tag>
                        </Popover>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ fontSize: '12px', color: '#5f6368' }}>
                Sent: {displayDate ? parseAsLocalDate(displayDate).toLocaleString(undefined, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false
                }) : ''}
              </div>
            </div>
          </div>

          <Space wrap size={6} className="email-detail-actions" style={{ marginTop: '6px', position: 'relative', zIndex: 2000, pointerEvents: 'auto' }}>
            <Button size="small" type="primary" onClick={() => { console.log('[EmailDetail] Reply clicked', email?.id); onReply && onReply(email); }}>
              Reply
            </Button>
            <Button size="small" onClick={() => { console.log('[EmailDetail] ReplyAll clicked', email?.id); onReplyAll && onReplyAll(email); }}>
              Reply All
            </Button>
            <Button size="small" onClick={() => onForward && onForward(email)}>
              Forward
            </Button>
            <Button
              size="small"
              icon={email.isStarred ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
              onClick={(e) => onStar(e, email)}
            >
              {email.isStarred ? 'Unstar' : 'Star'}
            </Button>

            <Popover
              content={
                <SnoozePopover
                  onConfirm={(until) => onSnooze && onSnooze(email.id, until)}
                />
              }
              trigger="click"
              placement="bottomRight"
            >
              <Button size="small" icon={<ClockCircleOutlined />}>
                Snooze
              </Button>
            </Popover>

            {canDelete && (
              <Button size="small" icon={<DeleteOutlined />} danger onClick={(e) => onDelete(e, email)}>
                Delete
              </Button>
            )}

            {canRestore && (
              <Button size="small" icon={<InboxOutlined />} onClick={() => onRestore && onRestore(email)}>
                Move to Inbox
              </Button>
            )}
            <Button
              size="small"
              icon={<ExportOutlined />}
              onClick={handleOpenInGmail}
              title="Open in Gmail"
            >
              Open in Gmail
            </Button>
            <Button
              size="small"
              icon={<RobotOutlined />}
              onClick={() => onSummarize && onSummarize(email)}
              loading={loadingSummary}
              disabled={email.summarySource === 'GEMINI'}
              title={email.summarySource === 'GEMINI' ? "Already summarized by Gemini" : "Generate AI Summary"}
            >
              AI Summary
            </Button>
            {isLocal && (
              <Button size="small" onClick={inspectHtml} danger={false}>
                Inspect HTML
              </Button>
            )}
          </Space>

          {(email.summary || loadingSummary) && (
            <Card
              size="small"
              title={<Space><RobotOutlined /> <Text strong>AI Summary</Text></Space>}
              style={{
                borderLeft: email.summarySource === 'GEMINI' ? '4px solid #48bb78' : '4px solid #667eea',
                background: '#fcfdff'
              }}
            >
              {loadingSummary ? (
                <div style={{ textAlign: 'center', padding: '10px' }}>
                  <Spin size="small" tip="Generative AI at work..." />
                </div>
              ) : (
                <Text style={{ fontStyle: 'italic', color: '#4a5568' }}>
                  {email.summary}
                </Text>
              )}
            </Card>
          )}

          <div style={{
            padding: '0 8px 16px', // Outer container breathing room
            backgroundColor: '#f8fafc',
            borderRadius: '16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            width: '100%',
            minHeight: '60vh'
          }}>
            <Card
              size="small"
              bodyStyle={{ padding: 0 }}
              style={{
                borderRadius: '12px',
                overflow: 'hidden',
                border: '1px solid #eef2f6',
                width: '100%',
                maxWidth: 'none',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
                backgroundColor: '#ffffff'
              }}
            >
              {/* Card is now ONLY for body content */}
              {!email.body ? (
                <div style={{ textAlign: 'center', padding: '60px 40px' }}>
                  {/* V29: Resilience Fallback - if high-fidelity body is missing, show preview/snipppet */}
                  {email.id && email.preview ? (
                    <div style={{ textAlign: 'left', width: '100%', margin: 0 }}>
                      <div style={{ color: '#5f6368', marginBottom: '16px', fontSize: '14px', borderBottom: '1px solid #f1f3f4', paddingBottom: '8px' }}>
                        <RobotOutlined /> Note: High-fidelity content unavailable. Showing preview snippet.
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap', color: '#202124', fontSize: '15px', lineHeight: '1.6' }}>
                        {email.preview}
                      </div>
                    </div>
                  ) : email.id ? (
                    <div style={{ color: '#5f6368' }}>
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No content available for this email" />
                    </div>
                  ) : (
                    <Spin size="large" tip="Processing high-fidelity content..." />
                  )}
                </div>
              ) : (
                <div style={{ backgroundColor: '#ffffff' }}>
                  <iframe
                    ref={iframeRef}
                    srcDoc={buildSrcDoc(email.body, sender.email)}
                    title="Email Content"
                    style={{
                      width: '100%',
                      height: `${iframeHeight}px`,
                      minWidth: 0,
                      border: 'none',
                      display: 'block',
                      overflowY: 'hidden',
                      overflowX: 'auto',
                      position: 'relative',
                      zIndex: 0,
                    }}
                    scrolling="auto"
                    sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
            </Card>
          </div>

          {email.attachments && email.attachments.length > 0 && (
            <Card
              size="small"
              title={<Space><PaperClipOutlined /> <Text strong>Attachments ({email.attachments.length})</Text></Space>}
              className="attachments-card"
              style={{
                borderRadius: '12px',
                border: '1px solid #eef2f6',
                background: '#f8fafc'
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                {email.attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="attachment-item"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '12px',
                      background: '#fff',
                      border: '1px solid #edf2f7',
                      borderRadius: '10px',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px' }}>
                      <div style={{
                        padding: '8px',
                        background: attachment.externalUrl ? '#e6f7ff' : '#f1f5f9',
                        borderRadius: '8px',
                        color: attachment.externalUrl ? '#1890ff' : '#667eea'
                      }}>
                        {attachment.externalUrl ? <CloudDownloadOutlined /> : <FileOutlined />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text strong className="block truncate" style={{ fontSize: '13px' }}>{attachment.filename}</Text>
                        <Text type="secondary" style={{ fontSize: '11px' }}>
                          {attachment.externalUrl ? 'Cloud Storage' : formatFileSize(attachment.size)}
                        </Text>
                      </div>
                    </div>
                    <Button
                      type="default"
                      size="small"
                      block
                      icon={attachment.externalUrl ? <LinkOutlined /> : <DownloadOutlined />}
                      onClick={() => {
                        if (attachment.externalUrl) {
                          window.open(attachment.externalUrl, '_blank');
                        } else {
                          onDownloadAttachment(email.id, attachment.id, attachment.filename);
                        }
                      }}
                      style={{ borderRadius: '6px', fontSize: '12px' }}
                    >
                      {attachment.externalUrl ? 'Open Link' : 'Download'}
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </Space>
      </div>
    </div>
  );
};

export default EmailDetail;