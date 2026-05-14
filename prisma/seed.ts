import { PrismaClient } from "@prisma/client";
import { colorFor } from "../src/lib/utils.js";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding demo data…");

  // Supervisor
  const supervisor = await prisma.user.upsert({
    where: { email: "supervisor@phdapp.local" },
    update: {},
    create: {
      email: "supervisor@phdapp.local",
      name: "Rafa (you)",
      role: "supervisor",
      color: "#6f4cff",
    },
  });

  // Co-supervisor
  const cosup = await prisma.user.upsert({
    where: { email: "alice@phdapp.local" },
    update: {},
    create: {
      email: "alice@phdapp.local",
      name: "Alice Co-supervisor",
      role: "co_supervisor",
      color: "#00d1c1",
    },
  });

  // Three students
  const studentSeeds = [
    {
      name: "Ada Lovelace",
      email: "ada@phdapp.local",
      year: 2,
      thesis: "Analytical engines for hardware-level differential equations",
      area: "Analog computing",
    },
    {
      name: "Alan Turing",
      email: "alan@phdapp.local",
      year: 3,
      thesis: "Decidability bounds for embedded SoC verification",
      area: "Formal methods",
    },
    {
      name: "Grace Hopper",
      email: "grace@phdapp.local",
      year: 1,
      thesis: "Compiler-driven layout optimization for IoT silicon",
      area: "EDA / compilers",
    },
  ];

  for (const s of studentSeeds) {
    const student = await prisma.student.upsert({
      where: { email: s.email },
      update: {},
      create: {
        fullName: s.name,
        email: s.email,
        programYear: s.year,
        thesisTitle: s.thesis,
        researchArea: s.area,
        color: colorFor(s.email),
        supervisorId: supervisor.id,
        coSupervisors: {
          create: { userId: cosup.id, role: "co_supervisor" },
        },
        startDate: new Date(Date.now() - s.year * 365 * 24 * 3600 * 1000),
        expectedEndDate: new Date(Date.now() + (4 - s.year) * 365 * 24 * 3600 * 1000),
      },
    });

    // Channel for each
    await prisma.channel.upsert({
      where: { id: `seed-channel-${student.id}` },
      update: {},
      create: {
        id: `seed-channel-${student.id}`,
        name: `1:1 · ${s.name.split(" ")[0]}`,
        kind: "student",
        color: student.color,
        studentId: student.id,
        members: {
          create: [{ userId: supervisor.id }, { userId: cosup.id }],
        },
      },
    });

    // A handful of tickets
    const today = new Date();
    const tickets = [
      {
        title: "Draft introduction chapter",
        status: "in_progress",
        priority: "high",
        category: "writing",
        due: 7,
      },
      {
        title: "Read recent paper on Bayesian optimization",
        status: "todo",
        priority: "medium",
        category: "reading",
        due: 3,
      },
      {
        title: "Run baseline experiments on new dataset",
        status: "in_progress",
        priority: "high",
        category: "experiment",
        due: 14,
      },
      {
        title: "Prepare slides for next group meeting",
        status: "todo",
        priority: "medium",
        category: "meeting",
        due: 2,
      },
      {
        title: "Submit ethics form revision",
        status: "review",
        priority: "urgent",
        category: "admin",
        due: 1,
      },
      {
        title: "Done — file 2024 progress report",
        status: "done",
        priority: "low",
        category: "admin",
        due: -10,
      },
    ];
    for (const t of tickets) {
      await prisma.ticket.create({
        data: {
          title: t.title,
          status: t.status,
          priority: t.priority,
          category: t.category,
          studentId: student.id,
          assigneeId: supervisor.id,
          createdById: supervisor.id,
          dueDate: new Date(today.getTime() + t.due * 24 * 3600 * 1000),
        },
      });
    }

    // A couple of upcoming events
    await prisma.event.create({
      data: {
        title: `Weekly 1:1 — ${s.name.split(" ")[0]}`,
        startsAt: new Date(Date.now() + 24 * 3600 * 1000 + 10 * 3600 * 1000),
        endsAt: new Date(Date.now() + 24 * 3600 * 1000 + 11 * 3600 * 1000),
        ownerId: supervisor.id,
        studentId: student.id,
      },
    });
  }

  // General channel
  await prisma.channel.upsert({
    where: { id: "general" },
    update: {},
    create: {
      id: "general",
      name: "general",
      kind: "general",
      color: "#ffcc4d",
      members: {
        create: [{ userId: supervisor.id }, { userId: cosup.id }],
      },
    },
  });

  console.log("✅ Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
