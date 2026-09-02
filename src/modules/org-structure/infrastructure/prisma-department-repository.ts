import "server-only";

import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import type {
  OrgEntityRepository,
  OrgEntityTransaction,
} from "../application/ports";
import { isUniqueViolation, recordOrgAudit } from "./shared";

function createTransaction(
  client: Prisma.TransactionClient,
): OrgEntityTransaction {
  return {
    async create(name) {
      return client.department.create({
        data: { name },
        select: { id: true, name: true },
      });
    },
    async update(id, name) {
      await client.department.update({ where: { id }, data: { name } });
    },
    async remove(id) {
      await client.department.delete({ where: { id } });
    },
    async recordEffects({ audit }) {
      await recordOrgAudit(client, audit);
    },
  };
}

export const prismaDepartmentRepository: OrgEntityRepository = {
  async findById(id) {
    return prisma.department.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
  },
  async transact(execute) {
    return prisma.$transaction((client) => execute(createTransaction(client)));
  },
  isUniqueViolation,
};
