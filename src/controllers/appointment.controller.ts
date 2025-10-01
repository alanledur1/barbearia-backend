import { Request, Response } from 'express';
import { AppointmentService } from '../services/appointmentService';

export class AppointmentController {
    // Método para criar um novo agendamento
    async create(req: Request, res: Response) {
        try {
            const { clientId, client, serviceId, date } = req.body;

            // Validação
            if (!serviceId || !date) {
                 return res.status(400).json({ error: 'ID do serviço e data são obrigatórios.' });
            }
            if (!clientId && (!client || !client.name || !client.email || !client.phone)) {
                 return res.status(400).json({ error: 'É necessário fornecer os dados do cliente ou um ID de cliente.' });
            }

            const appointmentDate = new Date(date);
            if (isNaN(appointmentDate.getTime())) {
                return res.status(400).json({ error: 'Formato de data inválido.' });
            }

            // --- CONVERSÃO DE IDS PARA NUMBER AQUI ---
            const clientIntId = clientId ? parseInt(clientId, 10) : undefined;
            const serviceIntId = parseInt(serviceId, 10);

            if (isNaN(serviceIntId)) {
                return res.status(400).json({ error: 'Invalid service ID format.' });
            }

            const appointmentService = new AppointmentService();
            const newAppointment = await appointmentService.createAppointment({
                clientId: clientIntId,
                clientData: client,
                serviceId: serviceIntId,
                requestedDateTime: appointmentDate,
            });

            return res.status(201).json(newAppointment);
        } catch (err: any) {
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.issues }); // Erros de validação Zod
            }
            return res.status(400).json({ error: err.message });
        }
    }

    // Método para listar todos os agendamentos
    async listAll(req: Request, res: Response) {
        try {
            const appointmentService = new AppointmentService();
            const appointments = await appointmentService.listAll();
            return res.status(200).json(appointments);
        } catch (err: any) {
            console.error("Error listing appointments:", err); // Para depuração
            return res.status(500).json({ error: 'Failed to retrieve appointments.' });
        }
    }

    // Método para buscar um agendamento por ID
    async getById(req: Request, res: Response) {
        try {
            const { id } = req.params; // O ID virá da URL como string, ex: /appointments/123

            // --- CONVERSÃO DE ID PARA NUMBER AQUI ---
            const appointmentId = parseInt(id, 10);
            if (isNaN(appointmentId)) {
                return res.status(400).json({ error: 'Invalid appointment ID format.' });
            }
            // --- FIM DA CONVERSÃO ---

            const appointmentService = new AppointmentService();
            const appointment = await appointmentService.findById(appointmentId); // Passa o ID como number

            if (!appointment) {
                return res.status(404).json({ error: 'Appointment not found.' });
            }

            return res.status(200).json(appointment);
        } catch (err: any) {
            return res.status(400).json({ error: err.message });
        }
    }
}