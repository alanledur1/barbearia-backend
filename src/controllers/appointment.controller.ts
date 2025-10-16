import { Request, Response } from 'express';
import { AppointmentService } from '../services/appointmentService';
import { CustomError } from '../utils/customErrors';

export class AppointmentController {
    // Método para criar um novo agendamento
    async create(req: Request, res: Response) {
        try {
            const { clientId, client, serviceId, date, notes, adminId } = req.body;

            // Validação
            if (!serviceId || !date) {
                return res.status(400).json({ error: 'ID do serviço e data são obrigatórios.' });
            }
            // Validação de um cliente logado OU dados de convidado.
            // A lógica de um admin logado agendando para um convidado se encaixa no segundo caso.
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
            const adminIntId = adminId ? parseInt(adminId, 10) : undefined;
            // --- FIM DA CONVERSÃO ---

            if (isNaN(serviceIntId)) {
                return res.status(400).json({ error: 'Invalid service ID format.' });
            }

            const appointmentService = new AppointmentService();
            const newAppointment = await appointmentService.createAppointment({
                clientId: clientIntId,
                clientData: client,
                serviceId: serviceIntId,
                requestedDateTime: appointmentDate,
                notes: notes,
                adminId: adminIntId,
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
            // Extrai os possíveis filtros da query string da URL
            const { date, clientId } = req.query;

            const appointmentService = new AppointmentService();

            // Passa os filtros para a camada de serviço
            const appointments = await appointmentService.listAll({
                date: date as string | undefined,
                clientId: clientId ? Number(clientId) : undefined
            });

            return res.status(200).json(appointments);
        } catch (err: any) {
            console.error("Error listing appointments:", err);
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

    async update(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const appointmentId = parseInt(id, 10);

            if (isNaN(appointmentId)) {
                return res.status(400).json({ error: 'ID de agendamento inválido.' });
            }

            const dataToUpdate = req.body;

            const appointmentService = new AppointmentService();
            const updatedAppointment = await appointmentService.update(appointmentId, dataToUpdate);

            return res.status(200).json(updatedAppointment);
        } catch (err: any) {
            if (err instanceof CustomError) {
                return res.status(err.statusCode).json({ error: err.message });
            }
            console.error("Erro ao atualizar agendamento:", err);
            return res.status(500).json({ error: 'Erro ao atualizar agendamento.' });
        }
    }

    async delete(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const appointmentId = parseInt(id, 10);

            if (isNaN(appointmentId)) {
                return res.status(400).json({ error: 'ID de agendamento inválido.' });
            }

            const appointmentService = new AppointmentService();
            await appointmentService.delete(appointmentId);

            // Retorna 204 No Content, que é o padrão para exclusões bem-sucedidas
            return res.status(204).send();

        } catch (err: any) {
            if (err instanceof CustomError) {
                return res.status(err.statusCode).json({ error: err.message });
            }
            console.error("Erro ao deletar agendamento:", err);
            return res.status(500).json({ error: 'Ocorreu um erro ao deletar o agendamento.' });
        }
    }
}