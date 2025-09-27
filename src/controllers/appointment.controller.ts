import { Request, Response } from 'express';
import { AppointmentService } from '../services/appointmentService';

export class AppointmentController {
    // Método para criar um novo agendamento
    async create(req: Request, res: Response) {
        try {
            // Um schema de validação, use-o aqui:
            // const data = appointmentSchema.parse(req.body);
            const { clientId, serviceId, adminId, date } = req.body;

            // Basicamente, verifica se os campos essenciais estão presentes
            if (!clientId || !serviceId || !date) {
                return res.status(400).json({ error: 'Client ID, Service ID and Date are required.' });
            }

            const appointmentDate = new Date(date);
            if (isNaN(appointmentDate.getTime())) {
                return res.status(400).json({ error: 'Invalid date format.' });
            }

            // --- CONVERSÃO DE IDS PARA NUMBER AQUI ---
            const clientIntId = parseInt(clientId, 10);
            const serviceIntId = parseInt(serviceId, 10);

            if (isNaN(clientIntId) || isNaN(serviceIntId)) {
                return res.status(400).json({ error: 'Invalid ID format. Client ID, Service ID, and Admin ID must be numbers.' });
            }
            // --- FIM DA CONVERSÃO ---

            const appointmentService = new AppointmentService();
            const newAppointment = await appointmentService.createAppointment(
                clientIntId,
                serviceIntId,
                adminId ? parseInt(adminId, 10) : undefined,
                appointmentDate
            );

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