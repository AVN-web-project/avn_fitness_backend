import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Staff } from '../src/models/staff.model.js';
import { Admin } from '../src/models/admin.model.js';
import { EMPLOYEE_ID_PREFIXES, calculateNextEmployeeId } from '../src/utils/employeeId.js';

const syncModel = async (Model, prefix) => {
  const existing = await Model.find({ employeeId: { $regex: '^' + prefix + '-' } }, 'employeeId')
    .sort({ employeeId: 1 })
    .lean();

  const known = existing.map((doc) => doc.employeeId);
  const docs = await Model.find({
    $or: [{ employeeId: { $exists: false } }, { employeeId: null }, { employeeId: '' }],
  })
    .sort({ createdAt: 1 })
    .lean();

  let count = 0;

  for (const doc of docs) {
    const nextId = calculateNextEmployeeId(known, prefix);
    known.push(nextId);
    await Model.updateOne({ _id: doc._id }, { $set: { employeeId: nextId } });
    count += 1;
  }

  return count;
};

const main = async () => {
  await mongoose.connect(env.MONGODB_URI);

  const staffCount = await syncModel(Staff, EMPLOYEE_ID_PREFIXES.staff);
  const adminCount = await syncModel(Admin, EMPLOYEE_ID_PREFIXES.admin);

  console.log(JSON.stringify({ staffAssigned: staffCount, adminAssigned: adminCount }));
  await mongoose.disconnect();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
