#![feature(string_remove_matches)]

use std::{
    fs::File,
    io::{BufWriter, Write},
    slice,
};

use anyhow::Context;
use clap::{Args, Parser, Subcommand};
use clap_num::si_number;
use cli_errors::CliResult;
use rand::{
    distributions::{Distribution, Uniform},
    SeedableRng,
};
use rand_distr::LogNormal;
use rand_xoshiro::Xoshiro256PlusPlus;

#[derive(Parser, Debug)]
#[clap(infer_subcommands = true)]
#[cfg_attr(test, clap(help_expected = true))]
struct Tools {
    #[clap(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand, Debug)]
enum Cmd {
    Generate(Generate),
}

#[derive(Args, Debug)]
struct Generate {
    #[clap(short = 'n', long = "entries", alias = "num-entries")]
    #[clap(parse(try_from_str = num_entries_parser))]
    #[clap(default_value = "10000")]
    num_entries: usize,
}

#[cli_errors::main]
fn main() -> CliResult<()> {
    let args = Tools::parse();

    match args.cmd {
        Cmd::Generate(options) => gen_entries(options.num_entries),
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

fn gen_entries(n: usize) -> CliResult<()> {
    let mut file = dirs::home_dir().context("Failed to retrieve home dir")?;
    file.push(".cache/clipboard-indicator@tudmotu.com/database.log");
    let file = File::create(file).context("Failed to open log file")?;
    let mut file = BufWriter::new(file);

    let mut rng = Xoshiro256PlusPlus::seed_from_u64(n as u64);
    let distr = LogNormal::from_mean_cv(500f64, 10f64).unwrap();
    let valid_byte_range = Uniform::from(0x21u8..=0x7E);

    let mut total = 0;
    for _ in 0..n {
        let bytes = distr.sample(&mut rng).round().max(1.) as usize;
        total += bytes;

        file.write_all(slice::from_ref(&1)) // Add op ID
            .context("Failed to write to log file")?;
        for b in valid_byte_range.sample_iter(&mut rng).take(bytes) {
            file.write_all(slice::from_ref(&b))
                .context("Failed to write to log file")?;
        }
        file.write_all(slice::from_ref(&0)) // NUL terminator
            .context("Failed to write to log file")?;
    }

    file.flush().context("Failed to write to log file")?;
    println!("Wrote {} bytes.", total);

    Ok(())
}
