/* ============================================
   Kahve Yanı — Custom Scripts
   ============================================ */

(function () {
  // Yükleme ekranını kaldır
  document.documentElement.classList.remove('is-loading');
  document.documentElement.classList.add('is-ready');
  var overlay = document.getElementById('overlay');
  if (overlay) {
    overlay.style.transition = 'opacity 0.5s ease';
    overlay.style.opacity = '0';
    setTimeout(function() { overlay.style.display = 'none'; }, 500);
  }

  function init() {
    var header = document.getElementById('header');
    var hero = document.getElementById('hero');
    var logo = document.querySelector('.header_logo');

    // Logo: sol hizalama — framework JS'ini override et
    if (logo) {
      logo.style.setProperty('margin-left', '0', 'important');
      logo.style.setProperty('margin-right', 'auto', 'important');
      logo.style.setProperty('padding-left', '0', 'important');
      logo.style.setProperty('width', 'auto', 'important');
    }

    // Scroll: hero bittikten sonra (ya da hero yoksa 80px'den sonra) header'a arka plan ekle
    function onScroll() {
      var scrolled;
      if (hero) {
        scrolled = hero.getBoundingClientRect().bottom <= 0;
      } else {
        scrolled = window.scrollY > 80;
      }
      if (scrolled) {
        header.classList.add('is-scrolled');
      } else {
        header.classList.remove('is-scrolled');
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });

    // Ürün kartı hover animasyonu (JS ile — CSS :hover touch'ta çalışmıyor)
    document.querySelectorAll('a.card.-style-below').forEach(function(card) {
      card.addEventListener('mouseenter', function() {
        card.classList.add('js-hover');
      });
      card.addEventListener('mouseleave', function() {
        card.classList.remove('js-hover');
      });
    });

    // Mobil hamburger menü
    var menuButton = document.querySelector('.header_button.-type-menu');
    var headerNav = document.getElementById('header-nav');
    if (menuButton && headerNav) {
      menuButton.addEventListener('click', function() {
        var isOpen = headerNav.classList.contains('is-open');
        headerNav.classList.toggle('is-open', !isOpen);
        headerNav.classList.toggle('is-closed', isOpen);
        header.classList.toggle('is-menu-open', !isOpen);
        header.classList.toggle('is-menu-closed', isOpen);
      });
      // Menü linkine tıklayınca kapat
      headerNav.querySelectorAll('a').forEach(function(link) {
        link.addEventListener('click', function() {
          headerNav.classList.remove('is-open');
          headerNav.classList.add('is-closed');
          header.classList.remove('is-menu-open');
          header.classList.add('is-menu-closed');
        });
      });
    }

    // Media column hover animasyonu (sw-media-col-hover)
    document.querySelectorAll('[sw-media-col-hover]').forEach(function(el) {
      var container = el.parentElement;
      el.addEventListener('mouseenter', function() {
        container.classList.remove('media-hover-out');
        container.classList.add('media-hover');
      });
      el.addEventListener('mouseleave', function() {
        container.classList.remove('media-hover');
        container.classList.add('media-hover-out');
        setTimeout(function() {
          container.classList.remove('media-hover-out');
        }, 300);
      });
    });
  }

  // Framework hazır olduktan sonra çalıştır
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
