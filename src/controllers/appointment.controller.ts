import { Request, Response } from 'express';
import { AppointmentService } from '../services/appointmentService';
import { CustomError } from '../utils/customErrors';
import { fromZonedTime } from 'date-fns-tz';
import { EmailService } from '../notifications/email.service';

export class AppointmentController {
    // Método para criar um novo agendamento
    async create(req: Request, res: Response) {
        try {
            const { clientId, client, serviceId, date, notes, adminId, usePlan } = req.body;

            // Validação
            if (!serviceId || !date) {
                return res.status(400).json({ error: 'ID do serviço e data são obrigatórios.' });
            }
            // Validação de um cliente logado OU dados de convidado.
            // A lógica de um admin logado agendando para um convidado se encaixa no segundo caso.
            if (!clientId && (!client || !client.name || !client.email || !client.phone)) {
                return res.status(400).json({ error: 'É necessário fornecer os dados do cliente ou um ID de cliente.' });
            }

            const appointmentDate = fromZonedTime(
                date,
                'America/Sao_Paulo'
            );

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
                usePlan: usePlan === true,
            });

            // Dispara o email de confirmação de forma não bloqueante — falha no envio
            // não deve impedir nem atrasar a resposta do agendamento.
            const recipientEmail: string | undefined = newAppointment.client?.email ?? newAppointment.guestEmail ?? undefined;
            const recipientName: string = newAppointment.client?.name ?? newAppointment.guestName ?? 'Cliente';
            if (recipientEmail) {
                new EmailService().sendAppointmentConfirmation(recipientEmail, {
                    clientName: recipientName,
                    serviceName: newAppointment.service?.name,
                    date: newAppointment.date,
                    barberName: newAppointment.admin?.name,
                }).catch((err: any) => console.error('Falha ao enviar email de confirmação de agendamento:', err));
            }

            return res.status(201).json(newAppointment);
        } catch (err: any) {
            if (err.name === 'ZodError') {
                return res.status(400).json({ error: err.issues }); // Erros de validação Zod
            }
            return res.status(400).json({ error: err.message });
        }
    }

    // Lista os barbeiros selecionáveis no fluxo de agendamento (rota pública)
    async listBarbers(req: Request, res: Response) {
        try {
            const appointmentService = new AppointmentService();
            const barbers = await appointmentService.listBookableBarbers();
            return res.status(200).json(barbers);
        } catch (err: any) {
            console.error("Error listing barbers:", err);
            return res.status(500).json({ error: 'Failed to retrieve barbers.' });
        }
    }

    // Horários ocupados de um barbeiro numa data (rota pública, sem dados de cliente)
    async getAvailability(req: Request, res: Response) {
        try {
            const { date, adminId } = req.query;

            if (!date || !adminId) {
                return res.status(400).json({ error: 'date e adminId são obrigatórios.' });
            }

            const adminIntId = parseInt(adminId as string, 10);
            if (isNaN(adminIntId)) {
                return res.status(400).json({ error: 'adminId inválido.' });
            }

            const appointmentService = new AppointmentService();
            const availability = await appointmentService.getAvailabilityByBarber(adminIntId, date as string);
            return res.status(200).json(availability);
        } catch (err: any) {
            console.error("Error getting availability:", err);
            return res.status(500).json({ error: 'Failed to retrieve availability.' });
        }
    }

    // Método para listar todos os agendamentos
    async listAll(req: Request, res: Response) {
        try {
            // Extrai os possíveis filtros da query string da URL
            const { date, clientId } = req.query;

            // Cliente só pode listar os próprios agendamentos, independente da query recebida
            const effectiveClientId = req.user?.role === 'CLIENTE'
                ? req.user.id
                : (clientId ? Number(clientId) : undefined);

            const appointmentService = new AppointmentService();

            // Passa os filtros para a camada de serviço
            const appointments = await appointmentService.listAll({
                date: date as string | undefined,
                clientId: effectiveClientId
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
            const appointmentId = parseInt(id as string, 10);
            if (isNaN(appointmentId)) {
                return res.status(400).json({ error: 'Invalid appointment ID format.' });
            }
            // --- FIM DA CONVERSÃO ---

            const appointmentService = new AppointmentService();
            const appointment = await appointmentService.findById(appointmentId); // Passa o ID como number

            if (!appointment) {
                return res.status(404).json({ error: 'Appointment not found.' });
            }

            if (req.user?.role === 'CLIENTE' && appointment.clientId !== req.user.id) {
                return res.status(403).json({ error: 'Acesso não permitido a este recurso.' });
            }

            return res.status(200).json(appointment);
        } catch (err: any) {
            return res.status(400).json({ error: err.message });
        }
    }

    async update(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const appointmentId = parseInt(id as string, 10);

            if (isNaN(appointmentId)) {
                return res.status(400).json({ error: 'ID de agendamento inválido.' });
            }

            const dataToUpdate = req.body;

            const appointmentService = new AppointmentService();

            if (req.user?.role === 'CLIENTE') {
                const existing = await appointmentService.findById(appointmentId);
                if (!existing) {
                    return res.status(404).json({ error: 'Appointment not found.' });
                }
                if (existing.clientId !== req.user.id) {
                    return res.status(403).json({ error: 'Acesso não permitido a este recurso.' });
                }
                if (dataToUpdate.status && dataToUpdate.status !== 'CANCELLED') {
                    return res.status(403).json({ error: 'Cliente só pode cancelar o próprio agendamento.' });
                }
            }

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
            const appointmentId = parseInt(id as string, 10);

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