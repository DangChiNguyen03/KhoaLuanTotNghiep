// Ensure dropdown clicks navigate correctly instead of bubbling to parent
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.dropdown-menu .dropdown-item').forEach((el) => {
    el.addEventListener('click', (e) => {
      // stop bubbling to prevent mis-click to first item
      e.stopPropagation();
      // let the browser follow href normally
    });
  });
});
// Auto-hide alerts after 3 seconds
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        const alerts = document.querySelectorAll('.alert');
        alerts.forEach(function(alert) {
            const bsAlert = new bootstrap.Alert(alert);
            bsAlert.close();
        });
    }, 3000);
});
