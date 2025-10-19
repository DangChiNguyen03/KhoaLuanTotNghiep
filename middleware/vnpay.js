const crypto = require('crypto');
const moment = require('moment');
const qs = require('qs');

/**
 * VNPay Payment Helper Class
 */
class VNPayPayment {
    constructor() {
        this.tmnCode = process.env.VNPAY_TMN_CODE;
        this.hashSecret = process.env.VNPAY_HASH_SECRET;
        this.url = process.env.VNPAY_URL;
        this.returnUrl = `${process.env.APP_URL}/payment/vnpay/callback`;
        this.version = '2.1.0';
        this.command = 'pay';
        this.currCode = 'VND';
        this.locale = 'vn';
    }

    /**
     * Create VNPay payment URL
     */
    createPaymentUrl(params) {
        try {
            const {
                orderId,
                amount,
                orderInfo,
                ipAddr = '127.0.0.1',
                bankCode = null
            } = params;

            const createDate = moment().format('YYYYMMDDHHmmss');
            const expireDate = moment().add(15, 'minutes').format('YYYYMMDDHHmmss');

            let vnpParams = {
                vnp_Version: this.version,
                vnp_Command: this.command,
                vnp_TmnCode: this.tmnCode,
                vnp_Locale: this.locale,
                vnp_CurrCode: this.currCode,
                vnp_TxnRef: orderId,
                vnp_OrderInfo: orderInfo,
                vnp_OrderType: 'other',
                vnp_Amount: amount * 100, // VNPay requires amount in VND cents
                vnp_ReturnUrl: this.returnUrl,
                vnp_IpAddr: ipAddr,
                vnp_CreateDate: createDate,
                vnp_ExpireDate: expireDate
            };

            if (bankCode) {
                vnpParams.vnp_BankCode = bankCode;
            }

            // Sort parameters
            vnpParams = this.sortObject(vnpParams);

            // Create signature
            const signData = qs.stringify(vnpParams, { encode: false });
            const hmac = crypto.createHmac('sha512', this.hashSecret);
            const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
            vnpParams.vnp_SecureHash = signed;

            // Create payment URL
            const paymentUrl = this.url + '/paymentv2/vpcpay.html?' + qs.stringify(vnpParams, { encode: false });

            return {
                success: true,
                data: {
                    paymentUrl: paymentUrl,
                    orderId: orderId,
                    amount: amount
                }
            };

        } catch (error) {
            console.error('VNPay create payment error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Verify VNPay callback
     */
    verifyCallback(vnpParams) {
        try {
            const secureHash = vnpParams.vnp_SecureHash;
            delete vnpParams.vnp_SecureHash;
            delete vnpParams.vnp_SecureHashType;

            // Sort parameters
            const sortedParams = this.sortObject(vnpParams);
            const signData = qs.stringify(sortedParams, { encode: false });
            
            const hmac = crypto.createHmac('sha512', this.hashSecret);
            const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

            return {
                isValid: secureHash === signed,
                responseCode: vnpParams.vnp_ResponseCode,
                transactionStatus: vnpParams.vnp_TransactionStatus,
                orderId: vnpParams.vnp_TxnRef,
                amount: parseInt(vnpParams.vnp_Amount) / 100, // Convert back from cents
                transactionId: vnpParams.vnp_TransactionNo,
                bankCode: vnpParams.vnp_BankCode,
                payDate: vnpParams.vnp_PayDate
            };

        } catch (error) {
            console.error('VNPay verify callback error:', error);
            return {
                isValid: false,
                error: error.message
            };
        }
    }

    /**
     * Sort object by keys
     */
    sortObject(obj) {
        const sorted = {};
        const keys = Object.keys(obj).sort();
        keys.forEach(key => {
            sorted[key] = encodeURIComponent(obj[key]).replace(/%20/g, '+');
        });
        return sorted;
    }

    /**
     * Get VNPay response message
     */
    getResponseMessage(responseCode) {
        const messages = {
            '00': 'Giao dịch thành công',
            '07': 'Trừ tiền thành công. Giao dịch bị nghi ngờ (liên quan tới lừa đảo, giao dịch bất thường).',
            '09': 'Giao dịch không thành công do: Thẻ/Tài khoản của khách hàng chưa đăng ký dịch vụ InternetBanking tại ngân hàng.',
            '10': 'Giao dịch không thành công do: Khách hàng xác thực thông tin thẻ/tài khoản không đúng quá 3 lần',
            '11': 'Giao dịch không thành công do: Đã hết hạn chờ thanh toán. Xin quý khách vui lòng thực hiện lại giao dịch.',
            '12': 'Giao dịch không thành công do: Thẻ/Tài khoản của khách hàng bị khóa.',
            '13': 'Giao dịch không thành công do Quý khách nhập sai mật khẩu xác thực giao dịch (OTP).',
            '24': 'Giao dịch không thành công do: Khách hàng hủy giao dịch',
            '51': 'Giao dịch không thành công do: Tài khoản của quý khách không đủ số dư để thực hiện giao dịch.',
            '65': 'Giao dịch không thành công do: Tài khoản của Quý khách đã vượt quá hạn mức giao dịch trong ngày.',
            '75': 'Ngân hàng thanh toán đang bảo trì.',
            '79': 'Giao dịch không thành công do: KH nhập sai mật khẩu thanh toán quá số lần quy định.',
            '99': 'Các lỗi khác (lỗi còn lại, không có trong danh sách mã lỗi đã liệt kê)'
        };

        return messages[responseCode] || 'Lỗi không xác định';
    }
}

module.exports = VNPayPayment;
