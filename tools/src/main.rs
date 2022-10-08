#![feature(string_remove_matches)]

use clap::{ArgAction, Args, Parser, Subcommand, ValueHint};
use clap_num::si_number;
use error_stack::{IntoReport, ResultExt};
use memmap2::Mmap;
use rand::{
    distributions::{Distribution, Uniform},
    SeedableRng,
};
use rand_distr::LogNormal;
use rand_xoshiro::Xoshiro256PlusPlus;
use std::{
    fs::File,
    io,
    io::{BufWriter, Write},
    path::PathBuf,
    slice,
};

#[derive(Parser, Debug)]
#[clap(version, author = "Alex Saveau (@SUPERCILEX)")]
#[clap(infer_subcommands = true, infer_long_args = true)]
#[clap(next_display_order = None)]
#[clap(max_term_width = 100)]
#[command(disable_help_flag = true)]
#[cfg_attr(test, clap(help_expected = true))]
struct Tools {
    #[clap(subcommand)]
    cmd: Cmd,
    #[arg(short, long, short_alias = '?', global = true)]
    #[arg(action = ArgAction::Help, help = "Print help information (use `--help` for more detail)")]
    #[arg(long_help = "Print help information (use `-h` for a summary)")]
    help: Option<bool>,
}

#[derive(Subcommand, Debug)]
enum Cmd {
    Generate(Generate),
    Dump(Dump),
}

#[derive(Args, Debug)]
struct Generate {
    #[clap(short = 'n', long = "entries", alias = "num-entries")]
    #[clap(value_parser = num_entries_parser)]
    #[clap(default_value = "10000")]
    num_entries: usize,
}

#[derive(Args, Debug)]
struct Dump {
    #[clap(value_hint = ValueHint::FilePath)]
    database: Option<PathBuf>,
}

fn main() -> error_stack::Result<(), io::Error> {
    let args = Tools::parse();

    match args.cmd {
        Cmd::Generate(options) => gen_entries(options.num_entries),
        Cmd::Dump(options) => dump(options.database),
    }
}

fn num_entries_parser(s: &str) -> Result<usize, String> {
    let files = lenient_si_number(s)?;
    if files > 0 {
        Ok(files)
    } else {
        Err(String::from("At least one entry must be generated."))
    }
}

fn lenient_si_number(s: &str) -> Result<usize, String> {
    let mut s = s.replace('K', "k");
    s.remove_matches(",");
    s.remove_matches("_");
    si_number(&s)
}

fn gen_entries(n: usize) -> error_stack::Result<(), io::Error> {
    let mut file = dirs::cache_dir()
        .ok_or_else(|| io::Error::from(io::ErrorKind::NotFound))
        .into_report()
        .attach_printable("Failed to retrieve home dir")?;
    file.push("clipboard-history@alexsaveau.dev/database.log");
    let file = File::create(file)
        .into_report()
        .attach_printable("Failed to open log file")?;
    let mut file = BufWriter::new(file);

    let mut rng = Xoshiro256PlusPlus::seed_from_u64(n as u64);
    let distr = LogNormal::from_mean_cv(500f64, 10f64).unwrap();
    let valid_byte_range = Uniform::from(0x21u8..=0x7E);

    let mut total = 0;
    for _ in 0..n {
        let bytes = distr.sample(&mut rng).round().max(1.) as usize;
        total += bytes;

        file.write_all(slice::from_ref(&1))
            .into_report() // Add op ID
            .attach_printable("Failed to write to log file")?;
        for b in valid_byte_range.sample_iter(&mut rng).take(bytes) {
            file.write_all(slice::from_ref(&b))
                .into_report()
                .attach_printable("Failed to write to log file")?;
        }
        file.write_all(slice::from_ref(&0))
            .into_report() // NUL terminator
            .attach_printable("Failed to write to log file")?;
    }

    file.flush()
        .into_report()
        .attach_printable("Failed to write to log file")?;
    println!("Wrote {} bytes.", total);

    Ok(())
}

fn dump(database: Option<PathBuf>) -> error_stack::Result<(), io::Error> {
    let database = database
        .or_else(|| {
            dirs::cache_dir().map(|mut f| {
                f.push("clipboard-history@alexsaveau.dev/database.log");
                f
            })
        })
        .ok_or_else(|| io::Error::from(io::ErrorKind::NotFound))
        .into_report()
        .attach_printable("Failed to find database file")?;

    let file = File::open(&database)
        .into_report()
        .attach_printable_lazy(|| format!("Failed to open file {database:?}"))?;
    let bytes = unsafe { Mmap::map(&file) }
        .into_report()
        .attach_printable("Failed to mmap file")?;

    const OP_TYPE_SAVE_TEXT: u8 = 1;
    const OP_TYPE_DELETE_TEXT: u8 = 2;
    const OP_TYPE_FAVORITE_ITEM: u8 = 3;
    const OP_TYPE_UNFAVORITE_ITEM: u8 = 4;
    const OP_TYPE_MOVE_ITEM_TO_END: u8 = 5;

    let mut save_count = 1;
    let mut i = 0;
    while i < bytes.len() {
        let op = bytes[i];
        i += 1;
        match op {
            OP_TYPE_SAVE_TEXT => {
                let length = 1 + memchr::memchr(0, &bytes[i..])
                    .ok_or_else(|| io::Error::from(io::ErrorKind::InvalidData))
                    .into_report()
                    .attach_printable("Data was not NUL terminated")?;
                println!("SAVE_TEXT@{i}\nLength: {length}\nId: {save_count}\n");
                i += length;
                save_count += 1;
            }
            OP_TYPE_DELETE_TEXT => {
                println!(
                    "DELETE_TEXT@{i}\nId: {}\n",
                    u32::from_le_bytes(bytes[i..i + 4].try_into().unwrap())
                );
                i += 4;
            }
            OP_TYPE_FAVORITE_ITEM => {
                println!(
                    "FAVORITE_ITEM@{i}\nId: {}\n",
                    u32::from_le_bytes(bytes[i..i + 4].try_into().unwrap())
                );
                i += 4;
            }
            OP_TYPE_UNFAVORITE_ITEM => {
                println!(
                    "UNFAVORITE_ITEM@{i}\nId: {}\n",
                    u32::from_le_bytes(bytes[i..i + 4].try_into().unwrap())
                );
                i += 4;
            }
            OP_TYPE_MOVE_ITEM_TO_END => {
                println!(
                    "MOVE_ITEM_TO_END@{i}\nId: {}\n",
                    u32::from_le_bytes(bytes[i..i + 4].try_into().unwrap())
                );
                i += 4;
            }
            _ => {
                return Err(io::Error::from(io::ErrorKind::InvalidData))
                    .into_report()
                    .attach_printable_lazy(|| format!("Invalid op: {}", bytes[i]));
            }
        }
    }

    Ok(())
}
