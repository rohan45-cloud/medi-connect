require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Doctor = require("./models/Doctor");
const User = require("./models/User");

// Every doctor gets a login with this password (demo only: change it for real use!)
const DOCTOR_PASSWORD = "Doctor@12345";
// The admin login (demo only: change it!)
const ADMIN_EMAIL = "admin@mediconnect.demo";
const ADMIN_PASSWORD = "Admin@12345";

const doctors = [{
        city: "Delhi",
        about: "Senior cardiologist focused on heart health, BP and preventive care.",
        name: "Dr. Amit Sharma",
        specialty: "Cardiologist",
        experience: 12,
        consultationFee: 800,
        rating: 4.8,
        available: true,
    },
    {
        city: "Mumbai",
        about: "Skin, hair and allergy specialist. Acne, eczema and cosmetic dermatology.",
        name: "Dr. Priya Verma",
        specialty: "Dermatologist",
        experience: 8,
        consultationFee: 600,
        rating: 4.7,
        available: true,
    },
    {
        city: "Bengaluru",
        about: "Treats headaches, migraines, epilepsy and nerve problems.",
        name: "Dr. Rahul Singh",
        specialty: "Neurologist",
        experience: 10,
        consultationFee: 900,
        rating: 4.9,
        available: true,
    },
    {
        city: "Pune",
        about: "Child health, vaccinations and growth check-ups from newborn to teen.",
        name: "Dr. Neha Gupta",
        specialty: "Pediatrician",
        experience: 6,
        consultationFee: 500,
        rating: 4.6,
        available: true,
    },
    {
        city: "Delhi",
        about: "Bone, joint and sports-injury care, including physiotherapy guidance.",
        name: "Dr. Karan Mehta",
        specialty: "Orthopedic",
        experience: 9,
        consultationFee: 700,
        rating: 4.5,
        available: true,
    },
    {
        city: "Jaipur",
        about: "Women's health, pregnancy care and gynecological problems.",
        name: "Dr. Sneha Kapoor",
        specialty: "Gynecologist",
        experience: 11,
        consultationFee: 700,
        rating: 4.7,
        available: true,
    },
    {
        city: "Hyderabad",
        about: "Eye check-ups, cataract, glasses and retina care.",
        name: "Dr. Vikram Reddy",
        specialty: "Ophthalmologist",
        experience: 14,
        consultationFee: 650,
        rating: 4.8,
        available: true,
    },
    {
        city: "Chennai",
        about: "Ear, nose and throat problems: sinus, hearing, tonsils and allergies.",
        name: "Dr. Anjali Nair",
        specialty: "ENT Specialist",
        experience: 7,
        consultationFee: 550,
        rating: 4.6,
        available: true,
    },
    {
        city: "Delhi",
        about: "Everyday illness, fever, diabetes and BP check-ups for the whole family.",
        name: "Dr. Rohit Malhotra",
        specialty: "General Physician",
        experience: 15,
        consultationFee: 400,
        rating: 4.5,
        available: true,
    },
    {
        city: "Mumbai",
        about: "Stress, anxiety, depression and sleep problems. Calm, private counselling.",
        name: "Dr. Kavita Joshi",
        specialty: "Psychiatrist",
        experience: 9,
        consultationFee: 1000,
        rating: 4.9,
        available: true,
    },
    {
        city: "Bengaluru",
        about: "Teeth cleaning, fillings, root canal and braces.",
        name: "Dr. Arjun Pillai",
        specialty: "Dentist",
        experience: 8,
        consultationFee: 450,
        rating: 4.6,
        available: true,
    },
    {
        city: "Pune",
        about: "Stomach, liver and digestion problems: acidity, IBS and gastric pain.",
        name: "Dr. Meera Deshmukh",
        specialty: "Gastroenterologist",
        experience: 13,
        consultationFee: 850,
        rating: 4.7,
        available: true,
    },
    {
        city: "Jaipur",
        about: "Chest, asthma, allergy and long-term cough care.",
        name: "Dr. Sanjay Rathore",
        specialty: "Pulmonologist",
        experience: 16,
        consultationFee: 750,
        rating: 4.8,
        available: true,
    },
    {
        city: "Hyderabad",
        about: "Diet, weight management, thyroid and diabetes lifestyle plans.",
        name: "Dr. Farah Khan",
        specialty: "Dietitian",
        experience: 5,
        consultationFee: 350,
        rating: 4.4,
        available: true,
    },
    {
        city: "Chennai",
        about: "Kidney stones, urine infections and men's urology care.",
        name: "Dr. Suresh Iyer",
        specialty: "Urologist",
        experience: 12,
        consultationFee: 900,
        rating: 4.7,
        available: true,
    },
];

// "Dr. Amit Sharma" -> "amit.sharma@mediconnect.demo"
function emailFor(name) {
    const words = name
        .toLowerCase()
        .replace(/^dr\.?\s+/, "")
        .replace(/[^a-z\s]/g, "")
        .trim()
        .split(/\s+/);
    return `${words.join(".")}@mediconnect.demo`;
}

async function seedDoctors() {
    let added = 0;

    for (const doctor of doctors) {
        const exists = await Doctor.findOne({
            name: doctor.name,
            specialty: doctor.specialty,
        });

        if (!exists) {
            await Doctor.create(doctor);
            added++;
        } else if (!exists.city) {
            // older records: fill in the new city / about fields
            exists.city = doctor.city;
            exists.about = doctor.about;
            await exists.save();
        }
    }

    console.log(`${added} new doctors added to the database.`);
    console.log(`${await Doctor.countDocuments()} total doctors in database.`);
}

// Creates a login (role: "doctor") for every doctor that does not have one yet.
async function seedDoctorAccounts() {
    const passwordHash = await bcrypt.hash(DOCTOR_PASSWORD, 12);
    const allDoctors = await Doctor.find();
    const logins = [];

    for (const doctor of allDoctors) {
        if (doctor.user) {
            continue; // already linked
        }

        const email = emailFor(doctor.name);

        try {
            let user = await User.findOne({ email });

            if (!user) {
                user = await User.create({
                    name: doctor.name,
                    email,
                    password: passwordHash,
                    role: "doctor",
                });
            } else if (user.role !== "doctor") {
                // never turn a patient's account into a doctor account
                console.warn(`Skipped ${doctor.name}: ${email} already belongs to a patient account.`);
                continue;
            }

            doctor.user = user._id;
            await doctor.save();
            logins.push(email);
        } catch (error) {
            console.warn(`Could not create a login for ${doctor.name}: ${error.message}`);
        }
    }

    console.log(`${logins.length} new doctor logins created.`);
    if (logins.length) {
        console.log(`Doctor login password: ${DOCTOR_PASSWORD}`);
        logins.forEach((email) => console.log(`  ${email}`));
    }
}

// Creates the admin login if it doesn't exist yet.
async function seedAdmin() {
    const existing = await User.findOne({ email: ADMIN_EMAIL });
    if (existing) {
        console.log("Admin login already exists.");
        return;
    }
    await User.create({
        name: "MediConnect Admin",
        email: ADMIN_EMAIL,
        password: await bcrypt.hash(ADMIN_PASSWORD, 12),
        role: "admin",
    });
    console.log(`Admin login created: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB connected successfully!");

        await seedDoctors();
        await seedDoctorAccounts();
        await seedAdmin();
    } catch (error) {
        console.error("Seeding failed:", error.message);
    } finally {
        await mongoose.disconnect();
    }
}

run();