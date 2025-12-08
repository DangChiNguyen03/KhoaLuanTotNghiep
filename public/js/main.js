// Ngăn dropdown click bị bubble lên parent
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.dropdown-menu .dropdown-item').forEach((el) => {
    el.addEventListener('click', (e) => {
      // Dừng event bubbling
      e.stopPropagation();
      // Để browser follow href bình thường
    });
  });
});
// Tự động ẩn thông báo sau 3 giây
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        const alerts = document.querySelectorAll('.alert');
        alerts.forEach(function(alert) {
            const bsAlert = new bootstrap.Alert(alert);
            bsAlert.close();
        });
    }, 3000);
});
