/* import axios from "axios";

export async function sendWhatsappMessage(phone: string, message: string) {
  const formattedPhone = phone.replace(/\D/g, "");
  const fullPhone = formattedPhone.startsWith("55")
    ? formattedPhone
    : `55${formattedPhone}`;

  const url = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`;

  await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to: fullPhone,
      type: "text",
      text: { body: message },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}
 */