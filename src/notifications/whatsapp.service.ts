import axios from 'axios';

const instance = process.env.ZAPI_INSTANCE;
const token = process.env.ZAPI_TOKEN;

/**
 * Envia uma mensagem de texto via API da Z-API.
 */
export async function sendWhatsappMessage(phone: string, message: string) {
    if (!instance || !token) {
        console.error("⚠️ Z-API não configurada no .env");
        return;
    }

    const formattedPhone = phone.replace(/\D/g, ''); // remove símbolos

    try {
        await axios.post(`${instance}/send-text`, {
            phone: `55${formattedPhone}`,
            message,
        }, {
            headers: { Authorization: `Bearer ${token}` },
        });

        console.log(`✅ Mensagem enviada para ${formattedPhone}`);
    } catch (err) {
        console.error("❌ Erro ao enviar mensagem via Z-API:", err);
    }
}
