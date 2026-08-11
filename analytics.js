/* Google Analytics 4 (GA4) - loaded on public pages only, not staff/admin pages. */
(function(){
  var ID = 'G-2G1L04222N';
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function(){ dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', ID);
})();
